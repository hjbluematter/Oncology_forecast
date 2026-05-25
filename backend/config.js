'use strict';
module.exports = {
  JWT_SECRET:     process.env.JWT_SECRET || 'oncocast-dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  PORT:           parseInt(process.env.PORT || '3001', 10),
  SALT_ROUNDS:    10,
};
