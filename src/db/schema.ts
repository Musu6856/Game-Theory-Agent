import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  BackgroundStory,
  EquilibriumResult,
  GameTheoryModel,
  HotellingModel,
  LiteratureAnalysis,
  PaperSection,
  PropertyAnalysis,
  Reference,
  ResearchProjectType,
  ResearchSession,
  ModelSourceMetadata,
  AgentTask,
  AgentTaskCheckpoint,
  AgentTaskInput,
  AgentTaskResult,
  AgentTaskStatus,
} from "@/lib/types";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    rawIdea: text("raw_idea").notNull(),
    refinedIdea: text("refined_idea").notNull(),
    projectType: text("project_type")
      .$type<ResearchProjectType>()
      .notNull()
      .default("legacy"),
    model: jsonb("model").$type<GameTheoryModel | null>(),
    researchSession: jsonb("research_session").$type<ResearchSession | null>(),
    modelSource: jsonb("model_source").$type<ModelSourceMetadata | null>(),
    wizardCompleted: boolean("wizard_completed").notNull().default(false),
    sections: jsonb("sections").$type<PaperSection[]>().notNull(),
    references: jsonb("references").$type<Reference[]>().notNull(),
    background: jsonb("background").$type<BackgroundStory | null>(),
    literatureAnalyses: jsonb("literature_analyses")
      .$type<LiteratureAnalysis[]>()
      .notNull()
      .default([]),
    hotellingModel: jsonb("hotelling_model").$type<HotellingModel | null>(),
    equilibriumResult: jsonb("equilibrium_result").$type<EquilibriumResult | null>(),
    propertyAnalyses: jsonb("property_analyses")
      .$type<PropertyAnalysis[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_owner_id_idx").on(table.ownerId),
    index("projects_owner_created_at_idx").on(table.ownerId, table.createdAt),
  ]
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: uuid("project_id").notNull(),
    action: text("action").$type<AgentTask["action"]>().notNull(),
    status: text("status").$type<AgentTaskStatus>().notNull().default("queued"),
    input: jsonb("input").$type<AgentTaskInput | Record<string, unknown>>().notNull(),
    checkpoints: jsonb("checkpoints")
      .$type<AgentTaskCheckpoint[]>()
      .notNull()
      .default([]),
    workerId: text("worker_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    result: jsonb("result").$type<AgentTaskResult | unknown>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_tasks_owner_project_idx").on(table.ownerId, table.projectId),
    index("agent_tasks_owner_status_idx").on(table.ownerId, table.status),
    index("agent_tasks_lease_until_idx").on(table.leaseUntil),
  ]
);

export type AgentTaskRow = typeof agentTasks.$inferSelect;
export type NewAgentTaskRow = typeof agentTasks.$inferInsert;
