import type { SchemaOptions } from "yaml";

/** Parsed `!Env NAME` — only allowed in stack `variables` per spec. */
export type YamlEnvRef = { readonly kind: "env"; readonly key: string };

/** Parsed `!Secret NAME` */
export type YamlSecretRef = { readonly kind: "secret"; readonly key: string };

/** Parsed `!Var NAME` */
export type YamlVarRef = { readonly kind: "var"; readonly key: string };

/** Parsed `!Param NAME` (cell.yaml; otavia.yaml must reject at higher layer). */
export type YamlParamRef = { readonly kind: "param"; readonly key: string };

export type YamlTagRef = YamlEnvRef | YamlSecretRef | YamlVarRef | YamlParamRef;

export function isEnvRef(v: unknown): v is YamlEnvRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as YamlEnvRef).kind === "env" &&
    typeof (v as YamlEnvRef).key === "string"
  );
}

export function isSecretRef(v: unknown): v is YamlSecretRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as YamlSecretRef).kind === "secret" &&
    typeof (v as YamlSecretRef).key === "string"
  );
}

export function isVarRef(v: unknown): v is YamlVarRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as YamlVarRef).kind === "var" &&
    typeof (v as YamlVarRef).key === "string"
  );
}

export function isParamRef(v: unknown): v is YamlParamRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as YamlParamRef).kind === "param" &&
    typeof (v as YamlParamRef).key === "string"
  );
}

function scalarKey(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Custom YAML tags for Otavia configs (aligned with legacy `yaml` package usage in cli-legacy).
 */
export const otaviaYamlCustomTags: NonNullable<SchemaOptions["customTags"]> = [
  {
    tag: "!Secret",
    resolve(value: string | null) {
      return { kind: "secret" as const, key: scalarKey(value) };
    },
  },
  {
    tag: "!Env",
    resolve(value: string | null) {
      return { kind: "env" as const, key: scalarKey(value) };
    },
  },
  {
    tag: "!Var",
    resolve(value: string | null) {
      return { kind: "var" as const, key: scalarKey(value) };
    },
  },
  {
    tag: "!Param",
    resolve(value: string | null) {
      return { kind: "param" as const, key: scalarKey(value) };
    },
  },
];
