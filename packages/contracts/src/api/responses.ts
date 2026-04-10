import { z } from 'zod';
import { standardErrorSchema } from '../common/error-envelope';
import { paginatedResponseSchema } from '../common/pagination';

export const apiSuccessSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.literal(true),
    data: schema,
  });

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: standardErrorSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiPaginatedSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.literal(true),
    data: paginatedResponseSchema(schema),
  });

export type ApiPaginated<T> = {
  success: true;
  data: {
    data: T[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
};
