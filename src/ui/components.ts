import type { ButtonConfig } from '../types';

export const createButton = ({
  id,
  text,
  onClick,
  styles = {},
  attributes = {},
}: ButtonConfig): HTMLButtonElement => {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;

  Object.entries(attributes).forEach(([k, v]) => button.setAttribute(k, v));

  Object.assign(button.style, {
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #0ea5a5',
    background: '#14b8a6',
    color: 'white',
    fontSize: '14px',
    margin: '8px 8px 0 0',
    ...styles,
  });

  button.addEventListener('click', onClick as EventListener);

  return button;
};

export const createInputButton = ({
  id,
  text,
  onClick,
  styles = {},
  attributes = {},
}: ButtonConfig): HTMLInputElement => {
  const button = document.createElement('input');
  button.id = id;
  button.type = 'button';
  button.value = text;

  Object.entries(attributes).forEach(([k, v]) => button.setAttribute(k, v));

  Object.assign(button.style, {
    ...styles,
  });

  button.addEventListener('click', onClick as EventListener);

  return button;
};