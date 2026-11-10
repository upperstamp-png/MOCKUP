import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import { requirePermission, requirePortalAuth } from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';

export async function portalTrainingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/training/courses
  fastify.get(
    '/courses',
    { preHandler: [requirePortalAuth, requirePermission('training:read')] },
    async (request, reply) => {
      const ctx = request.portal!;

      const [coursesRes, lessonsRes, enrollmentsRes, progressRes, unitRes] = await Promise.all([
        dbQuery(
          `SELECT * FROM portal.courses WHERE is_published = TRUE ORDER BY sector_order ASC, title ASC`
        ),
        dbQuery(
          `SELECT * FROM portal.lessons WHERE is_published = TRUE ORDER BY course_id, lesson_order ASC`
        ),
        dbQuery(
          `SELECT * FROM portal.enrollments WHERE unit_id = $1 AND user_id = $2`,
          [ctx.activeUnitId, ctx.userId]
        ),
        dbQuery(
          `SELECT * FROM portal.lesson_progress WHERE unit_id = $1 AND user_id = $2`,
          [ctx.activeUnitId, ctx.userId]
        ),
        dbQuery<{ training_completed: boolean; banca_approved: boolean; operational_status: string }>(
          `SELECT training_completed, banca_approved, operational_status FROM portal.units WHERE id = $1`,
          [ctx.activeUnitId]
        ),
      ]);

      const enrollMap = new Map(enrollmentsRes.rows.map((e) => [e.course_id, e]));
      const progMap = new Map(progressRes.rows.map((p) => [p.lesson_id, p]));

      const courses = coursesRes.rows.map((course) => {
        const courseLessons = lessonsRes.rows
          .filter((l) => l.course_id === course.id)
          .map((l) => ({
            ...l,
            progress: progMap.get(l.id) || {
              status: 'not_started',
              resume_position_seconds: 0,
              quiz_score_pct: null,
              completed_at: null,
            },
          }));
        const completedLessons = courseLessons.filter((l) => l.progress.status === 'completed').length;
        return {
          ...course,
          enrollment: enrollMap.get(course.id) || null,
          completedLessonsCount: completedLessons,
          totalLessonsCount: courseLessons.length,
          lessons: courseLessons,
        };
      });

      return reply.send({
        courses,
        governanceSeparation: {
          userTrainingCompleted: unitRes.rows[0]?.training_completed ?? false,
          unitBancaApproved: unitRes.rows[0]?.banca_approved ?? false,
          unitOperationalStatus: unitRes.rows[0]?.operational_status ?? 'onboarding',
          note: 'Capacitação do usuário na Universidade e habilitação operacional da unidade são marcos distintos e independentes.',
        },
      });
    }
  );

  // POST /api/v1/training/lessons/:lessonId/progress
  fastify.post(
    '/lessons/:lessonId/progress',
    { preHandler: [requirePortalAuth, requirePermission('training:write')] },
    async (request, reply) => {
      const { lessonId } = request.params as { lessonId: string };
      if (!z.string().uuid().safeParse(lessonId).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de aula inválido.' });
      }
      const schema = z.object({
        resumePositionSeconds: z.number().int().nonnegative().default(0),
        status: z.enum(['in_progress', 'completed']).default('in_progress'),
        quizAnswers: z.array(z.number().int().nonnegative()).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const lessonRes = await dbQuery<{ id: string; course_id: string; quiz_questions: Array<{ correctIndex: number }> }>(
        `SELECT id, course_id, quiz_questions FROM portal.lessons WHERE id = $1`,
        [lessonId]
      );
      const lesson = lessonRes.rows[0];
      if (!lesson) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Aula não encontrada.' });
      }

      const d = parsed.data;
      let quizScorePct: number | null = null;
      if (Array.isArray(lesson.quiz_questions) && lesson.quiz_questions.length > 0 && d.quizAnswers) {
        let correct = 0;
        lesson.quiz_questions.forEach((q, idx) => {
          if (d.quizAnswers![idx] === q.correctIndex) correct++;
        });
        quizScorePct = Number(((correct / lesson.quiz_questions.length) * 100).toFixed(2));
      }

      const ctx = request.portal!;
      const result = await withTransaction(async (client) => {
        const lpRes = await client.query(
          `INSERT INTO portal.lesson_progress (
             unit_id, user_id, lesson_id, status, resume_position_seconds, quiz_score_pct, completed_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6, CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END
           )
           ON CONFLICT (unit_id, user_id, lesson_id)
           DO UPDATE SET
             status = CASE WHEN portal.lesson_progress.status = 'completed' THEN 'completed' ELSE EXCLUDED.status END,
             resume_position_seconds = GREATEST(portal.lesson_progress.resume_position_seconds, EXCLUDED.resume_position_seconds),
             quiz_score_pct = COALESCE(EXCLUDED.quiz_score_pct, portal.lesson_progress.quiz_score_pct),
             completed_at = COALESCE(portal.lesson_progress.completed_at, EXCLUDED.completed_at),
             updated_at = NOW()
           RETURNING *`,
          [ctx.activeUnitId, ctx.userId, lessonId, d.status, d.resumePositionSeconds, quizScorePct]
        );

        // Atualiza matrícula no curso
        const courseStats = await client.query<{ total: string; done: string }>(
          `SELECT
             (SELECT COUNT(*)::text FROM portal.lessons WHERE course_id = $1 AND is_published = TRUE) AS total,
             (SELECT COUNT(*)::text FROM portal.lesson_progress lp
              JOIN portal.lessons l ON l.id = lp.lesson_id
              WHERE l.course_id = $1 AND lp.unit_id = $2 AND lp.user_id = $3 AND lp.status = 'completed') AS done`,
          [lesson.course_id, ctx.activeUnitId, ctx.userId]
        );
        const total = Number(courseStats.rows[0]?.total || 0);
        const done = Number(courseStats.rows[0]?.done || 0);
        const courseCompleted = total > 0 && done >= total;

        await client.query(
          `INSERT INTO portal.enrollments (unit_id, user_id, course_id, status, completed_at)
           VALUES ($1,$2,$3,$4, CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END)
           ON CONFLICT (unit_id, user_id, course_id)
           DO UPDATE SET
             status = EXCLUDED.status,
             completed_at = COALESCE(portal.enrollments.completed_at, EXCLUDED.completed_at),
             updated_at = NOW()`,
          [ctx.activeUnitId, ctx.userId, lesson.course_id, courseCompleted ? 'completed' : 'in_progress']
        );

        // Verifica se todos os cursos obrigatórios da unidade/usuário foram concluídos
        const pendingMandatoryRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.courses c
           WHERE c.is_published = TRUE AND c.is_mandatory = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM portal.enrollments e
               WHERE e.course_id = c.id AND e.unit_id = $1 AND e.user_id = $2 AND e.status = 'completed'
             )`,
          [ctx.activeUnitId, ctx.userId]
        );
        const allMandatoryDone = Number(pendingMandatoryRes.rows[0]?.cnt || 0) === 0;
        if (allMandatoryDone) {
          await client.query(`UPDATE portal.units SET training_completed = TRUE, updated_at = NOW() WHERE id = $1`, [
            ctx.activeUnitId,
          ]);
        }

        if (d.status === 'completed') {
          await recordAuditLog(
            {
              unitId: ctx.activeUnitId,
              action: 'training.lesson_completed',
              entityType: 'lesson',
              entityId: lessonId,
              afterState: { quizScorePct, courseCompleted },
              request,
            },
            client
          );
        }

        return { lessonProgress: lpRes.rows[0], courseCompleted, allMandatoryDone };
      });

      return reply.send(result);
    }
  );
}
