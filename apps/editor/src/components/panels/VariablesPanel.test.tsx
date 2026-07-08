import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenDoc } from '@openmake/core';
import { VariablesPanel } from './VariablesPanel.js';
import { useVariablesStore } from '../../store/variables.js';

afterEach(() => {
  useVariablesStore.setState({ activeModeByCollection: {} });
});

describe('VariablesPanel', () => {
  it('adds a collection via the doc', () => {
    const doc = OpenDoc.create();
    render(<VariablesPanel doc={doc} />);
    expect(Object.keys(doc.getVariableCollections())).toHaveLength(0);
    fireEvent.click(screen.getByTestId('add-collection-button'));
    expect(Object.keys(doc.getVariableCollections())).toHaveLength(1);
  });

  it('adds a mode to the selected collection', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme', 'Light');
    render(<VariablesPanel doc={doc} />);
    fireEvent.click(screen.getByTestId('add-mode-button'));
    expect(doc.getVariableCollections()[colId]!.modes).toHaveLength(2);
  });

  it('creates a variable and edits its color value for the active mode', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const modeId = doc.getVariableCollections()[colId]!.modes[0]!.id;
    render(<VariablesPanel doc={doc} />);

    fireEvent.click(screen.getByTestId('add-variable-button'));
    const varId = Object.keys(doc.getVariables())[0]!;
    expect(doc.getVariables()[varId]!.type).toBe('COLOR');

    const valueInput = screen.getByTestId(`variable-value-${varId}`) as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '#123456' } });
    expect(doc.getVariables()[varId]!.valuesByMode[modeId]).toBe('#123456');
  });

  it('renames a variable', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme');
    const varId = doc.createVariable(colId, 'COLOR', 'old');
    render(<VariablesPanel doc={doc} />);
    const nameInput = screen.getByTestId(`variable-name-${varId}`) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'new' } });
    fireEvent.blur(nameInput);
    expect(doc.getVariables()[varId]!.name).toBe('new');
  });

  it('deletes a variable', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme');
    const varId = doc.createVariable(colId, 'COLOR', 'primary');
    render(<VariablesPanel doc={doc} />);
    fireEvent.click(screen.getByTestId(`delete-variable-${varId}`));
    expect(doc.getVariables()[varId]).toBeUndefined();
  });

  it('deletes a collection and cascades its variables', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme');
    const varId = doc.createVariable(colId, 'FLOAT', 'spacing');
    render(<VariablesPanel doc={doc} />);
    fireEvent.click(screen.getByTestId(`delete-collection-${colId}`));
    expect(doc.getVariableCollections()[colId]).toBeUndefined();
    expect(doc.getVariables()[varId]).toBeUndefined();
  });

  it('switching mode tab updates the store and shows that mode value', () => {
    const doc = OpenDoc.create();
    const colId = doc.createVariableCollection('Theme', 'Light');
    const lightId = doc.getVariableCollections()[colId]!.modes[0]!.id;
    const darkId = doc.addMode(colId, 'Dark');
    const varId = doc.createVariable(colId, 'STRING', 'label', 'light-text');
    doc.updateVariable(varId, { valuesByMode: { [darkId]: 'dark-text' } });
    render(<VariablesPanel doc={doc} />);

    // Default active mode is Light.
    let valueInput = screen.getByTestId(`variable-value-${varId}`) as HTMLInputElement;
    expect(valueInput.value).toBe('light-text');

    fireEvent.click(screen.getByTestId(`mode-${darkId}`));
    expect(useVariablesStore.getState().activeModeByCollection[colId]).toBe(darkId);
    valueInput = screen.getByTestId(`variable-value-${varId}`) as HTMLInputElement;
    expect(valueInput.value).toBe('dark-text');
    expect(lightId).not.toBe(darkId);
  });
});
