import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { VariablesPanel, groupsOf, ALL_GROUP } from './VariablesPanel.js';
import { useVariablesStore } from '../../store/variables.js';

afterEach(() => {
  useVariablesStore.setState({ activeModeByCollection: {} });
});

describe('groupsOf', () => {
  it('derives groups from slash-prefixes with an All pseudo-group and counts', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme');
    doc.createVariable(col, 'COLOR', 's-badge/base');
    doc.createVariable(col, 'COLOR', 's-badge/hover');
    doc.createVariable(col, 'COLOR', 's-button/base');
    doc.createVariable(col, 'COLOR', 'plain'); // no group
    const vars = Object.values(doc.getVariables());
    const groups = groupsOf(vars);
    expect(groups[0]).toEqual({ id: ALL_GROUP, label: 'All', count: 4 });
    const real = groups.slice(1);
    expect(real).toEqual([
      { id: 's-badge', label: 's-badge', count: 2 },
      { id: 's-button', label: 's-button', count: 1 },
    ]);
  });
});

describe('VariablesPanel', () => {
  it('adds a collection via the doc', () => {
    const doc = OpenDoc.create();
    render(<VariablesPanel doc={doc} />);
    expect(Object.keys(doc.getVariableCollections())).toHaveLength(0);
    fireEvent.click(screen.getByTestId('add-collection-button'));
    expect(Object.keys(doc.getVariableCollections())).toHaveLength(1);
  });

  it('shows a variable count per collection', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme');
    doc.createVariable(col, 'COLOR', 'a');
    doc.createVariable(col, 'COLOR', 'b');
    render(<VariablesPanel doc={doc} />);
    expect(screen.getByTestId(`collection-count-${col}`).textContent).toBe('2');
  });

  it('creates a variable via the create-variable row type picker', () => {
    const doc = OpenDoc.create();
    doc.createVariableCollection('Theme', 'Light');
    render(<VariablesPanel doc={doc} />);
    expect(Object.keys(doc.getVariables())).toHaveLength(0);
    fireEvent.click(screen.getByTestId('create-variable-FLOAT'));
    const vars = Object.values(doc.getVariables());
    expect(vars).toHaveLength(1);
    expect(vars[0]!.type).toBe('FLOAT');
  });

  it('adds a mode column via the header + button', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme', 'Light');
    render(<VariablesPanel doc={doc} />);
    expect(doc.getVariableCollections()[col]!.modes).toHaveLength(1);
    fireEvent.click(screen.getByTestId('add-mode-button'));
    expect(doc.getVariableCollections()[col]!.modes).toHaveLength(2);
  });

  it('edits a per-mode value cell', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme', 'Light');
    const modeId = doc.getVariableCollections()[col]!.modes[0]!.id;
    const varId = doc.createVariable(col, 'COLOR', 'primary');
    render(<VariablesPanel doc={doc} />);
    const input = screen.getByTestId(`variable-value-${varId}-${modeId}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#123456' } });
    expect(doc.getVariables()[varId]!.valuesByMode[modeId]).toBe('#123456');
  });

  it('filters rows by group selection', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme');
    const badge = doc.createVariable(col, 'COLOR', 's-badge/base');
    const button = doc.createVariable(col, 'COLOR', 's-button/base');
    render(<VariablesPanel doc={doc} />);
    // All group: both rows visible.
    expect(screen.queryByTestId(`variable-${badge}`)).not.toBeNull();
    expect(screen.queryByTestId(`variable-${button}`)).not.toBeNull();
    // Select s-badge group: only badge row.
    fireEvent.click(screen.getByTestId('group-s-badge'));
    expect(screen.queryByTestId(`variable-${badge}`)).not.toBeNull();
    expect(screen.queryByTestId(`variable-${button}`)).toBeNull();
  });

  it('filters rows by search text', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme');
    const alpha = doc.createVariable(col, 'COLOR', 'alpha');
    const beta = doc.createVariable(col, 'COLOR', 'beta');
    render(<VariablesPanel doc={doc} />);
    fireEvent.change(screen.getByTestId('variable-search'), { target: { value: 'alph' } });
    expect(screen.queryByTestId(`variable-${alpha}`)).not.toBeNull();
    expect(screen.queryByTestId(`variable-${beta}`)).toBeNull();
  });

  it('renders an alias chip with the target name and can unlink it', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme', 'Light');
    const modeId = doc.getVariableCollections()[col]!.modes[0]!.id;
    const target = doc.createVariable(col, 'COLOR', 'target', '#abcabc');
    const source = doc.createVariable(col, 'COLOR', 'source');
    doc.setVariableAlias(source, modeId, target);
    render(<VariablesPanel doc={doc} />);

    const chip = screen.getByTestId(`alias-chip-${source}-${modeId}`);
    expect(within(chip).getByText('target')).not.toBeNull();

    fireEvent.click(screen.getByTestId(`alias-unlink-${source}-${modeId}`));
    // Alias cleared → scalar cell present again.
    expect(screen.queryByTestId(`alias-chip-${source}-${modeId}`)).toBeNull();
    expect(screen.getByTestId(`variable-value-${source}-${modeId}`)).not.toBeNull();
  });

  it('alias picker excludes self and cycle-forming candidates', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme', 'Light');
    const modeId = doc.getVariableCollections()[col]!.modes[0]!.id;
    const a = doc.createVariable(col, 'COLOR', 'a', '#aaaaaa');
    const b = doc.createVariable(col, 'COLOR', 'b', '#bbbbbb');
    const num = doc.createVariable(col, 'FLOAT', 'num'); // different type
    // b -> a, so aliasing a -> b would cycle: b must be excluded from a's picker.
    doc.setVariableAlias(b, modeId, a);
    render(<VariablesPanel doc={doc} />);

    fireEvent.click(screen.getByTestId(`alias-button-${a}-${modeId}`));
    // Self excluded.
    expect(screen.queryByTestId(`alias-candidate-${a}`)).toBeNull();
    // Cycle-forming target excluded.
    expect(screen.queryByTestId(`alias-candidate-${b}`)).toBeNull();
    // Different type excluded.
    expect(screen.queryByTestId(`alias-candidate-${num}`)).toBeNull();
  });

  it('alias picker sets an alias on the chosen candidate', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme', 'Light');
    const modeId = doc.getVariableCollections()[col]!.modes[0]!.id;
    const a = doc.createVariable(col, 'COLOR', 'a', '#aaaaaa');
    const b = doc.createVariable(col, 'COLOR', 'b', '#bbbbbb');
    render(<VariablesPanel doc={doc} />);
    fireEvent.click(screen.getByTestId(`alias-button-${a}-${modeId}`));
    fireEvent.click(screen.getByTestId(`alias-candidate-${b}`));
    expect(doc.getVariables()[a]!.valuesByMode[modeId]).toEqual({ alias: b });
    expect(doc.resolveVariableValue(a, modeId)).toBe('#bbbbbb');
  });

  it('deletes a collection and cascades its variables', () => {
    const doc = OpenDoc.create();
    const col = doc.createVariableCollection('Theme');
    const varId = doc.createVariable(col, 'FLOAT', 'spacing');
    render(<VariablesPanel doc={doc} />);
    fireEvent.click(screen.getByTestId(`delete-collection-${col}`));
    expect(doc.getVariableCollections()[col]).toBeUndefined();
    expect(doc.getVariables()[varId]).toBeUndefined();
  });
});
