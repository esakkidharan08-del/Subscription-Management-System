export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Invalid id');
  return id;
}
