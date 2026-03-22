import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { generateTemplate } from "../template.js";

function mainConfigDir(root: string): string {
  return path.join(root, "apps", "main");
}

function createMinimalOtaviaRoot(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "otavia-deploy-test-"));
  fs.mkdirSync(mainConfigDir(tmp), { recursive: true });
  fs.writeFileSync(
    path.join(mainConfigDir(tmp), "otavia.yaml"),
    `
stackName: test-stack
cells:
  - sso
domain:
  host: example.com
params:
  FOO: bar
`,
    "utf-8"
  );
  const ssoDir = path.join(tmp, "apps", "sso");
  fs.mkdirSync(ssoDir, { recursive: true });
  fs.writeFileSync(
    path.join(ssoDir, "cell.yaml"),
    `
name: sso
params:
  - FOO
tables:
  users:
    keys: { pk: S, sk: S }
backend:
  runtime: nodejs20.x
  entries:
    api:
      handler: index.ts
      timeout: 30
      memory: 256
      routes:
        - /api/*
`,
    "utf-8"
  );
  return tmp;
}

describe("generateTemplate", () => {
  test("includes AppSync Event API and channel namespace when cell enables appsyncEvents", () => {
    const rootDir = createMinimalOtaviaRoot();
    try {
      const ssoDir = path.join(rootDir, "apps", "sso");
      const cellPath = path.join(ssoDir, "cell.yaml");
      const prev = fs.readFileSync(cellPath, "utf-8");
      fs.writeFileSync(
        cellPath,
        `${prev}
appsyncEvents:
  enabled: true
`,
        "utf-8"
      );
      const yaml = generateTemplate(rootDir, mainConfigDir(rootDir));
      expect(yaml).toContain("AWS::AppSync::Api");
      expect(yaml).toContain("AWS::AppSync::ApiKey");
      expect(yaml).toContain("AWS::AppSync::ChannelNamespace");
      expect(yaml).toContain("AppSyncEventApi");
      expect(yaml).toContain("appsync:Publish");
      expect(yaml).toContain("APPSYNC_EVENTS_API_ID");
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test("produces valid YAML with AWS::DynamoDB::Table, AWS::Lambda::Function, and AWS::ApiGatewayV2::Api", () => {
    const rootDir = createMinimalOtaviaRoot();
    try {
      const yaml = generateTemplate(rootDir, mainConfigDir(rootDir));
      expect(typeof yaml).toBe("string");
      expect(yaml).toContain("AWSTemplateFormatVersion");
      expect(yaml).toContain("Resources:");

      expect(yaml).toContain("AWS::DynamoDB::Table");
      expect(yaml).toContain("AWS::Lambda::Function");
      expect(yaml).toContain("AWS::ApiGatewayV2::Api");

      expect(yaml).toContain("SsoUsersTable");
      expect(yaml).toContain("SsoApiFunction");
      expect(yaml).toContain("SsoHttpApi");
    } finally {
      fs.rmSync(rootDir, { recursive: true });
    }
  });

  test("includes frontend bucket and CloudFront when domain.host is set", () => {
    const rootDir = createMinimalOtaviaRoot();
    try {
      const yaml = generateTemplate(rootDir, mainConfigDir(rootDir));
      expect(yaml).toContain("FrontendBucket");
      expect(yaml).toContain("AWS::CloudFront::Distribution");
    } finally {
      fs.rmSync(rootDir, { recursive: true });
    }
  });

  test("derives CloudFront API behaviors from backend entry routes", () => {
    const rootDir = createMinimalOtaviaRoot();
    try {
      const yaml = generateTemplate(rootDir, mainConfigDir(rootDir));
      expect(yaml).toContain("PathPattern: /sso/api/*");
      expect(yaml).not.toContain("PathPattern: /sso/*");
    } finally {
      fs.rmSync(rootDir, { recursive: true });
    }
  });

  test("uses defaultCell as CloudFront root redirect target", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "otavia-deploy-test-"));
    fs.writeFileSync(
      path.join(tmp, "otavia.yaml"),
      `
stackName: test-stack
defaultCell: drive
cells:
  sso: "@otavia/sso"
  drive: "@otavia/drive"
domain:
  host: example.com
`,
      "utf-8"
    );
    const ssoDir = path.join(tmp, "apps", "sso");
    fs.mkdirSync(ssoDir, { recursive: true });
    fs.writeFileSync(
      path.join(ssoDir, "cell.yaml"),
      `
name: sso
backend:
  runtime: nodejs20.x
  entries:
    api:
      handler: index.ts
      timeout: 30
      memory: 256
      routes:
        - /api/*
`,
      "utf-8"
    );
    const driveDir = path.join(tmp, "apps", "drive");
    fs.mkdirSync(driveDir, { recursive: true });
    fs.writeFileSync(path.join(driveDir, "cell.yaml"), "name: drive\n", "utf-8");
    try {
      const yaml = generateTemplate(tmp, tmp);
      expect(yaml).toContain('var rootRedirectPath = "/drive/";');
      expect(yaml).toContain("statusCode: 302");
      expect(yaml).toContain("location: { value: rootRedirectPath }");
      expect(yaml).not.toContain("event.request.uri = '/index.html';");
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});
