import { z } from 'zod'
import { idSchema, timestampSchema, contentHashSchema, nonEmptyString } from './common'
import { providerTargetSchema } from './provider'

/**
 * Experiment, Target, Template, Variable, Variant, Run, RunBatch, Response,
 * Observation, Evidence, Annotation, JudgeResult, Report.
 *
 * Incomplete/draft states are modeled with discriminated unions on `status`.
 */

// ---------- Target ----------

export const targetSchema = z
  .object({
    id: idSchema,
    name: nonEmptyString('Target name'),
    provider: providerTargetSchema,
    createdBy: idSchema.nullable(),
    createdAt: timestampSchema,
  })
  .describe('Target: the actual direct provider and model used for runs.')

export type Target = z.infer<typeof targetSchema>

// ---------- Template / Variable / Variant ----------

export const variableKindSchema = z
  .enum(['categorical', 'continuous', 'free-text'])
  .describe('Variable kind. Choose one kind from the list.')

export type VariableKind = z.infer<typeof variableKindSchema>

export const variableSchema = z
  .object({
    id: idSchema,
    templateId: idSchema,
    name: nonEmptyString('Variable name'),
    kind: variableKindSchema,
  })
  .describe('Variable: one slot in a template.')

export type Variable = z.infer<typeof variableSchema>

export const variantSchema = z
  .object({
    id: idSchema,
    variableId: idSchema,
    value: nonEmptyString('Variant value'),
    /** Short display label. Explicit null when not set. */
    label: nonEmptyString('Variant label').nullable(),
  })
  .describe('Variant: one value a variable can take.')

export type Variant = z.infer<typeof variantSchema>

export const templateSchema = z
  .object({
    id: idSchema,
    experimentId: idSchema,
    name: nonEmptyString('Template name'),
    /** Prompt body. May contain {{variable}} placeholders. */
    body: nonEmptyString('Template body'),
    createdAt: timestampSchema,
  })
  .describe('Template: the prompt body sent to a target.')

export type Template = z.infer<typeof templateSchema>

// ---------- Experiment ----------

export const experimentStatusSchema = z
  .enum(['draft', 'running', 'paused', 'completed', 'archived'])
  .describe('Experiment status. Choose one status from the list.')

export type ExperimentStatus = z.infer<typeof experimentStatusSchema>

/** Experiment fields shared by every status. */
const experimentBase = {
  id: idSchema,
  name: nonEmptyString('Experiment name'),
  targetId: idSchema,
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
}

/** Draft: hypothesis optional. */
export const draftExperimentSchema = z
  .object({
    ...experimentBase,
    status: z.literal('draft'),
    hypothesis: nonEmptyString('Hypothesis').nullable(),
  })
  .describe('Draft experiment. The hypothesis is not yet final.')

/** Non-draft: hypothesis must be stated. */
export const activeExperimentSchema = z
  .object({
    ...experimentBase,
    status: z.enum(['running', 'paused', 'completed', 'archived']),
    hypothesis: nonEmptyString('Hypothesis'),
  })
  .describe('Experiment past draft. The hypothesis is final.')

export const experimentSchema = z
  .discriminatedUnion('status', [draftExperimentSchema, activeExperimentSchema])
  .describe('Experiment. Shape depends on status.')

export type DraftExperiment = z.infer<typeof draftExperimentSchema>
export type ActiveExperiment = z.infer<typeof activeExperimentSchema>
export type Experiment = z.infer<typeof experimentSchema>

// ---------- Run / RunBatch ----------

export const runStatusSchema = z
  .enum(['pending', 'in-flight', 'succeeded', 'failed', 'cancelled'])
  .describe('Run status. Choose one status from the list.')

export type RunStatus = z.infer<typeof runStatusSchema>

const runBase = {
  id: idSchema,
  batchId: idSchema,
  templateId: idSchema,
  createdAt: timestampSchema,
}

/** Pending: no target snapshot yet; the run has not started. */
export const pendingRunSchema = z
  .object({
    ...runBase,
    status: z.literal('pending'),
  })
  .describe('Pending run. The run has not started.')

/** Started or finished: the target snapshot is frozen onto the run. */
export const recordedRunSchema = z
  .object({
    ...runBase,
    status: z.enum(['in-flight', 'succeeded', 'failed', 'cancelled']),
    /** Snapshot of the actual direct provider and model for this run. */
    target: providerTargetSchema,
  })
  .describe('Run that started. The target snapshot is frozen.')

export const runSchema = z
  .discriminatedUnion('status', [pendingRunSchema, recordedRunSchema])
  .describe('Run. Shape depends on status.')

export type PendingRun = z.infer<typeof pendingRunSchema>
export type RecordedRun = z.infer<typeof recordedRunSchema>
export type Run = z.infer<typeof runSchema>

export const runBatchSchema = z
  .object({
    id: idSchema,
    experimentId: idSchema,
    status: z
      .enum(['pending', 'running', 'done', 'failed'])
      .describe('Run batch status. Choose one status from the list.'),
    startedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .describe('Run batch: one group of runs of one experiment.')

export type RunBatch = z.infer<typeof runBatchSchema>

// ---------- Response ----------

/** A recorded raw response. Immutable once written. */
export const responseSchema = z
  .object({
    id: idSchema,
    runId: idSchema,
    body: nonEmptyString('Response body'),
    contentHash: contentHashSchema,
    receivedAt: timestampSchema,
  })
  .describe('Recorded raw response. Immutable once written.')

/** Recorded responses are immutable: body, hash, and time are readonly. */
export type Response = Readonly<z.infer<typeof responseSchema>>

// ---------- Observation / Evidence / Annotation ----------

export const observationSchema = z
  .object({
    id: idSchema,
    experimentId: idSchema,
    summary: nonEmptyString('Observation summary'),
    createdAt: timestampSchema,
  })
  .describe('Observation: one finding of an experiment.')

export type Observation = z.infer<typeof observationSchema>

/** Evidence ties an observation to an immutable content hash. */
export const evidenceSchema = z
  .object({
    id: idSchema,
    observationId: idSchema,
    responseId: idSchema.nullable(),
    contentHash: contentHashSchema,
    hashVerified: z.boolean().describe('True when the hash was re-checked against the response.'),
    createdAt: timestampSchema,
  })
  .describe('Evidence: immutable proof that backs an observation.')

/** Evidence content hashes are readonly. */
export type Evidence = Readonly<z.infer<typeof evidenceSchema>>

export const annotationSchema = z
  .object({
    id: idSchema,
    evidenceId: idSchema,
    authorId: idSchema.nullable(),
    note: nonEmptyString('Annotation note'),
    createdAt: timestampSchema,
  })
  .describe('Annotation: a human note on evidence.')

export type Annotation = z.infer<typeof annotationSchema>

// ---------- JudgeResult ----------

export const judgeVerdictSchema = z
  .enum(['biased', 'not-biased', 'inconclusive'])
  .describe('Judge verdict. Choose one verdict from the list.')

export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>

export const judgeResultSchema = z
  .object({
    id: idSchema,
    runId: idSchema,
    judgeModel: nonEmptyString('Judge model'),
    verdict: judgeVerdictSchema,
    rationale: nonEmptyString('Rationale').nullable(),
    createdAt: timestampSchema,
  })
  .describe('Judge result: an automated verdict on one run.')

export type JudgeResult = z.infer<typeof judgeResultSchema>

// ---------- Report ----------

/** A report. Immutable once written; hash is re-verifiable. */
export const reportSchema = z
  .object({
    id: idSchema,
    experimentId: idSchema,
    title: nonEmptyString('Report title'),
    body: nonEmptyString('Report body'),
    contentHash: contentHashSchema,
    hashVerified: z.boolean(),
    createdAt: timestampSchema,
  })
  .describe('Report: written result of an experiment. Immutable once written.')

/** Reports are immutable: body and content hash are readonly. */
export type Report = Readonly<z.infer<typeof reportSchema>>
