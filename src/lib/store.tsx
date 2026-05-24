"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useEffect,
  useRef,
} from "react";
import { useUser } from "@clerk/nextjs";
import { fetchProjects, saveProject } from "./api";
import { isDevelopmentGuestMode } from "./auth";
import { markResearchAssetsStaleAfterModelEdit } from "./research-flow";
import type {
  ResearchProject,
  BackgroundStory,
  EquilibriumResult,
  GameTheoryModel,
  HotellingModel,
  LiteratureAnalysis,
  PaperSection,
  PropertyAnalysis,
  Reference,
  WizardStep,
} from "./types";

interface AppState {
  currentProject: ResearchProject | null;
  projects: ResearchProject[];
  wizardStep: WizardStep;
  isLoading: boolean;
}

type Action =
  | { type: "SET_PROJECT"; payload: ResearchProject }
  | { type: "UPDATE_PROJECT"; payload: Partial<ResearchProject> }
  | { type: "SET_BACKGROUND"; payload: BackgroundStory }
  | { type: "SET_LITERATURE_ANALYSES"; payload: LiteratureAnalysis[] }
  | { type: "SET_HOTELLING_MODEL"; payload: HotellingModel }
  | { type: "SET_EQUILIBRIUM_RESULT"; payload: EquilibriumResult }
  | { type: "SET_PROPERTY_ANALYSES"; payload: PropertyAnalysis[] }
  | { type: "SET_MODEL"; payload: GameTheoryModel }
  | { type: "ADD_SECTION"; payload: PaperSection }
  | { type: "UPDATE_SECTION"; payload: { id: string; content: string } }
  | { type: "SET_REFERENCES"; payload: Reference[] }
  | { type: "SET_WIZARD_STEP"; payload: WizardStep }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "NEW_PROJECT"; payload: ResearchProject }
  | { type: "LOAD_PROJECTS"; payload: ResearchProject[] }
  | { type: "DELETE_PROJECT"; payload: string }
  | { type: "CLEAR_PROJECTS" };

const initialState: AppState = {
  currentProject: null,
  projects: [],
  wizardStep: "players",
  isLoading: true,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_PROJECT":
      const projectExists = state.projects.some(
        (project) => project.id === action.payload.id
      );
      return {
        ...state,
        currentProject: action.payload,
        projects: projectExists
          ? state.projects.map((project) =>
              project.id === action.payload.id ? action.payload : project
            )
          : [action.payload, ...state.projects],
      };
    case "UPDATE_PROJECT":
      if (!state.currentProject) return state;
      const updated = { ...state.currentProject, ...action.payload };
      return {
        ...state,
        currentProject: updated,
        projects: state.projects.map((project) =>
          project.id === updated.id ? updated : project
        ),
      };
    case "SET_BACKGROUND":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: { ...state.currentProject, background: action.payload },
      };
    case "SET_LITERATURE_ANALYSES":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          literatureAnalyses: action.payload,
        },
      };
    case "SET_HOTELLING_MODEL":
      if (!state.currentProject) return state;
      const nextProject = {
        ...state.currentProject,
        hotellingModel: action.payload,
      };
      const updatedProject = state.currentProject.hotellingModel
        ? markResearchAssetsStaleAfterModelEdit(nextProject)
        : nextProject;
      return {
        ...state,
        currentProject: updatedProject,
        projects: state.projects.map((project) =>
          project.id === updatedProject.id ? updatedProject : project
        ),
      };
    case "SET_EQUILIBRIUM_RESULT":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          equilibriumResult: action.payload,
        },
      };
    case "SET_PROPERTY_ANALYSES":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          propertyAnalyses: action.payload,
        },
      };
    case "SET_MODEL":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: { ...state.currentProject, model: action.payload },
      };
    case "ADD_SECTION":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sections: [...state.currentProject.sections, action.payload],
        },
      };
    case "UPDATE_SECTION":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sections: state.currentProject.sections.map((s) =>
            s.id === action.payload.id
              ? { ...s, content: action.payload.content }
              : s
          ),
        },
      };
    case "SET_REFERENCES":
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          references: action.payload,
        },
      };
    case "SET_WIZARD_STEP":
      return { ...state, wizardStep: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "NEW_PROJECT":
      return {
        ...state,
        currentProject: action.payload,
        projects: [action.payload, ...state.projects],
        wizardStep: "players",
      };
    case "LOAD_PROJECTS":
      return { ...state, projects: action.payload, isLoading: false };
    case "DELETE_PROJECT":
      return {
        ...state,
        currentProject:
          state.currentProject?.id === action.payload
            ? null
            : state.currentProject,
        projects: state.projects.filter((project) => project.id !== action.payload),
      };
    case "CLEAR_PROJECTS":
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isLoaded, isSignedIn } = useUser();
  const authReady = isDevelopmentGuestMode() || isLoaded;
  const canUseProjects = isDevelopmentGuestMode() || isSignedIn;
  const lastSavedProject = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  const pendingSave = useRef<{
    project: ResearchProject;
    serialized: string;
  } | null>(null);

  const flushPendingSave = useCallback(async () => {
    if (saveInFlight.current) return;

    saveInFlight.current = true;

    try {
      while (pendingSave.current) {
        const nextSave = pendingSave.current;
        pendingSave.current = null;

        if (nextSave.serialized === lastSavedProject.current) {
          continue;
        }

        try {
          await saveProject(nextSave.project);
          lastSavedProject.current = nextSave.serialized;
        } catch (e) {
          console.error("Failed to save project", e);
          if (!pendingSave.current) {
            lastSavedProject.current = null;
          }
        }
      }
    } finally {
      saveInFlight.current = false;
    }
  }, []);

  // Load projects from Neon once Clerk knows the current auth state.
  useEffect(() => {
    if (!authReady) return;

    if (!canUseProjects) {
      dispatch({ type: "CLEAR_PROJECTS" });
      lastSavedProject.current = null;
      pendingSave.current = null;
      return;
    }

    let cancelled = false;

    async function loadProjects() {
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        const projects = await fetchProjects();
        if (!cancelled) {
          dispatch({ type: "LOAD_PROJECTS", payload: projects });
        }
      } catch (e) {
        console.error("Failed to load projects", e);
        if (!cancelled) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
    }

    loadProjects();

    return () => {
      cancelled = true;
    };
  }, [authReady, canUseProjects]);

  // Persist the active project after local edits.
  useEffect(() => {
    if (!authReady || !canUseProjects || !state.currentProject) return;

    const serialized = JSON.stringify(state.currentProject);
    if (serialized === lastSavedProject.current) return;

    const timeoutId = window.setTimeout(() => {
      pendingSave.current = {
        project: state.currentProject!,
        serialized,
      };
      void flushPendingSave();
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [flushPendingSave, authReady, canUseProjects, state.currentProject]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
