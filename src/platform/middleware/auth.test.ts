import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { AuthenticatedRequest } from '../types.js';
import { authMiddleware } from './auth.js';

test('a JWT tenant and role cannot be overridden by request headers', () => {
  const token = jwt.sign(
    {
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
      tenantId: 'tenant-from-jwt',
      orgId: 'org-1',
      role: 'DISPATCHER',
      branches: [],
      permissions: [],
    },
    env.JWT_SECRET,
  );
  const request = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-tenant-id': 'attacker-tenant',
      'x-demo-role': 'SUPER_ADMIN',
    },
  } as unknown as AuthenticatedRequest;
  let nextError: unknown;

  authMiddleware(request, {} as Response, ((error?: unknown) => {
    nextError = error;
  }) as NextFunction);

  assert.equal(nextError, undefined);
  assert.equal(request.auth?.tenantId, 'tenant-from-jwt');
  assert.equal(request.auth?.role, 'DISPATCHER');
});
