import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '@mockup/types';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    userSession?: JWTPayload;
  }
}

/**
 * Middleware para validar o token JWT de sessão de vendedor/dispositivo
 */
export async function authenticateSeller(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'MISSING_OR_INVALID_TOKEN',
        message: 'Token de autenticação ausente ou malformatado',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const decoded = await request.jwtVerify<JWTPayload>();
    request.userSession = decoded;
  } catch (err) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'INVALID_TOKEN_SIGNATURE',
      message: 'Token de sessão inválido ou expirado',
      details: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Middleware para validar chamadas administrativas através de ADMIN_API_KEY
 */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-admin-key'];
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      code: 'INVALID_ADMIN_CREDENTIALS',
      message: 'Acesso administrativo não autorizado',
      timestamp: new Date().toISOString(),
    });
  }
}
