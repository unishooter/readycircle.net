export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details?: ApiErrorDetail[]) {
    super(400, 'bad_request', message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have access to this resource.') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, 'conflict', message);
  }
}
