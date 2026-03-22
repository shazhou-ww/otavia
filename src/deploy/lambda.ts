import type { CfnFragment } from "./types.js";
import { toPascalCase } from "./types.js";

export interface LambdaFragmentProps {
  handlerPath: string;
  runtime: string;
  timeout: number;
  memory: number;
  /** Plain strings or CloudFormation intrinsics (Ref / Fn::GetAtt). */
  envVars: Record<string, string | Record<string, unknown>>;
  /** Logical IDs of DynamoDB table resources (e.g. SsoThreadsTable) for IAM */
  tableLogicalIds?: string[];
  /** Logical IDs of S3 bucket resources for IAM */
  bucketLogicalIds?: string[];
  /** For Secrets Manager refs: key -> secret name (cell/secretName) */
  secretRefs?: Record<string, string>;
  /** When set, grants appsync:Publish and injects APPSYNC_EVENTS_* env for AppSync Events HTTP publish. */
  appsyncEventApiLogicalId?: string;
}

/**
 * Generate Lambda function + IAM role for one backend entry.
 * Env vars from resolved params; IAM policy for DynamoDB and S3 if provided.
 */
export function generateLambdaFragment(
  entryKey: string,
  logicalIdPrefix: string,
  props: LambdaFragmentProps
): CfnFragment {
  const pascalEntry = toPascalCase(entryKey);
  const functionLogicalId = `${logicalIdPrefix}${pascalEntry}Function`;
  const roleLogicalId = `${logicalIdPrefix}${pascalEntry}LambdaRole`;

  const envVariables: Record<string, string | Record<string, unknown>> = { ...props.envVars };
  if (props.secretRefs) {
    for (const [key, secretName] of Object.entries(props.secretRefs)) {
      envVariables[key] = `{{resolve:secretsmanager:${secretName}}}`;
    }
  }
  const apiLogical = props.appsyncEventApiLogicalId;
  if (apiLogical) {
    envVariables.APPSYNC_EVENTS_API_ID = { "Fn::GetAtt": [apiLogical, "ApiId"] };
    envVariables.APPSYNC_EVENTS_HTTP_DOMAIN = { "Fn::GetAtt": [apiLogical, "Dns.Http"] };
    envVariables.APPSYNC_EVENTS_REALTIME_DOMAIN = { "Fn::GetAtt": [apiLogical, "Dns.Realtime"] };
  }

  const policyStatements: unknown[] = [
    {
      Effect: "Allow",
      Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      Resource: "*",
    },
  ];

  if (props.tableLogicalIds && props.tableLogicalIds.length > 0) {
    const tableResources: unknown[] = [];
    for (const id of props.tableLogicalIds) {
      tableResources.push({ "Fn::GetAtt": [id, "Arn"] });
      tableResources.push({ "Fn::Sub": `\${${id}.Arn}/index/*` });
    }
    policyStatements.push({
      Effect: "Allow",
      Action: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:Scan",
      ],
      Resource: tableResources,
    });
  }

  if (props.bucketLogicalIds && props.bucketLogicalIds.length > 0) {
    const bucketResources: unknown[] = [];
    for (const id of props.bucketLogicalIds) {
      bucketResources.push({ "Fn::GetAtt": [id, "Arn"] });
      bucketResources.push({ "Fn::Sub": `\${${id}.Arn}/*` });
    }
    policyStatements.push({
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      Resource: bucketResources,
    });
  }

  if (apiLogical) {
    policyStatements.push({
      Effect: "Allow",
      Action: "appsync:Publish",
      Resource: {
        "Fn::Sub": [
          "arn:aws:appsync:${AWS::Region}:${AWS::AccountId}:apis/${ApiId}/*",
          { ApiId: { "Fn::GetAtt": [apiLogical, "ApiId"] } },
        ],
      },
    });
  }

  const resources: Record<string, unknown> = {
    [roleLogicalId]: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "LambdaPolicy",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: policyStatements,
            },
          },
        ],
      },
    },
    [functionLogicalId]: {
      Type: "AWS::Lambda::Function",
      Properties: {
        Runtime: props.runtime,
        Handler: "index.handler",
        Code: { S3Bucket: "PLACEHOLDER", S3Key: props.handlerPath },
        Timeout: props.timeout,
        MemorySize: props.memory,
        Role: { "Fn::GetAtt": [roleLogicalId, "Arn"] },
        Environment: { Variables: envVariables },
      },
    },
  };

  return { Resources: resources };
}
