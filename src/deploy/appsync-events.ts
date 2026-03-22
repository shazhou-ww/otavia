import type { CfnFragment } from "./types.js";

/** Shared logical id for the stack Event API (one per template). */
export const APPSYNC_EVENT_API_LOGICAL_ID = "AppSyncEventApi";

const APPSYNC_EVENT_API_KEY_LOGICAL_ID = "AppSyncEventApiKey";

/**
 * One AWS AppSync Event API per stack (HTTP + realtime DNS; API_KEY auth for publish/subscribe/connect).
 */
export function generateAppSyncEventApi(stackName: string): CfnFragment {
  const name = `${stackName}-events`.replace(/[^A-Za-z0-9_\-\s]/g, "-").slice(0, 50);
  return {
    Resources: {
      [APPSYNC_EVENT_API_LOGICAL_ID]: {
        Type: "AWS::AppSync::Api",
        Properties: {
          Name: name,
          EventConfig: {
            AuthProviders: [{ AuthType: "API_KEY" }],
            ConnectionAuthModes: [{ AuthType: "API_KEY" }],
            DefaultPublishAuthModes: [{ AuthType: "API_KEY" }],
            DefaultSubscribeAuthModes: [{ AuthType: "API_KEY" }],
          },
        },
      },
    },
    Outputs: {
      AppSyncEventApiId: {
        Description: "AppSync Event API id (use with HTTP /event and realtime clients)",
        Value: { "Fn::GetAtt": [APPSYNC_EVENT_API_LOGICAL_ID, "ApiId"] },
      },
      AppSyncEventHttpDomain: {
        Description: "HTTP DNS host for AppSync Events (publish via https://<host>/event)",
        Value: { "Fn::GetAtt": [APPSYNC_EVENT_API_LOGICAL_ID, "Dns.Http"] },
      },
      AppSyncEventRealtimeDomain: {
        Description: "Realtime WebSocket DNS host for AppSync Events subscriptions",
        Value: { "Fn::GetAtt": [APPSYNC_EVENT_API_LOGICAL_ID, "Dns.Realtime"] },
      },
    },
  };
}

/**
 * API key for API_KEY auth (clients and tests). Store as a secret in production.
 */
export function generateAppSyncEventApiKey(stackName: string): CfnFragment {
  return {
    Resources: {
      [APPSYNC_EVENT_API_KEY_LOGICAL_ID]: {
        Type: "AWS::AppSync::ApiKey",
        Properties: {
          ApiId: { "Fn::GetAtt": [APPSYNC_EVENT_API_LOGICAL_ID, "ApiId"] },
          Description: `${stackName}-events-api-key`.slice(0, 256),
        },
      },
    },
    Outputs: {
      AppSyncEventApiKey: {
        Description:
          "AppSync Events API key (sensitive; prefer SSM/Secrets in production)",
        Value: { "Fn::GetAtt": [APPSYNC_EVENT_API_KEY_LOGICAL_ID, "ApiKey"] },
      },
    },
  };
}

/**
 * Channel namespace for one cell; channels are /<name>/...
 */
export function generateAppSyncChannelNamespace(
  cellLogicalPrefix: string,
  namespaceName: string
): CfnFragment {
  const id = `${cellLogicalPrefix}AppSyncChannelNamespace`;
  return {
    Resources: {
      [id]: {
        Type: "AWS::AppSync::ChannelNamespace",
        Properties: {
          ApiId: { "Fn::GetAtt": [APPSYNC_EVENT_API_LOGICAL_ID, "ApiId"] },
          Name: namespaceName,
        },
      },
    },
  };
}
