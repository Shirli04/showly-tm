const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/http-error');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch (error) {
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}

function requireRoleOrPermission(permission) {
  return function checkAccess(req, res, next) {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, 'Authentication required'));
    }

    if (user.role === 'superadmin' || user.role === 'admin') {
      return next();
    }

    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (permissions.includes(permission)) {
      return next();
    }

    return next(new HttpError(403, 'Insufficient permissions'));
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return next(new HttpError(403, 'Superadmin access required'));
  }
  return next();
}

module.exports = {
  requireAuth,
  requireRoleOrPermission,
  requireSuperAdmin
};
