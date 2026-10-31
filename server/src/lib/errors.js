export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, message, details);
export const unauthorized = (message = 'Please log in') => new AppError(401, message);
export const forbidden = (message = 'You do not have access to this') => new AppError(403, message);
export const notFound = (what = 'Record') => new AppError(404, `${what} not found`);
export const conflict = (message) => new AppError(409, message);
