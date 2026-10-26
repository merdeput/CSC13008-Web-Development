class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options.code || (status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : undefined);
  }
}

class ValidationError extends Error {
  constructor(errors, message = 'Vui lòng kiểm tra lại thông tin đã nhập.') {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

function isPrismaCode(error, code) {
  return Boolean(error && error.code === code);
}

function isUniqueFieldError(error, field) {
  if (!isPrismaCode(error, 'P2002')) return false;
  const constraint = error.meta?.driverAdapterError?.cause?.constraint;
  const targets = [error.meta?.target, constraint?.fields, constraint?.index, constraint?.name];
  return targets.some((target) => (Array.isArray(target) ? target : [target]).some((value) => {
    const name = String(value || '').replace(/["`]/g, '');
    return name === field || name.endsWith(`_${field}_key`);
  }));
}

module.exports = { HttpError, ValidationError, isPrismaCode, isUniqueFieldError };
