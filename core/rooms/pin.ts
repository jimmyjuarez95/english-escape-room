const PIN_LENGTH = 6;

export function generatePin(): string {
  const min = 10 ** (PIN_LENGTH - 1);
  const max = 10 ** PIN_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}
