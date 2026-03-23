/**
 * Minimal Lambda + function URL CloudFormation (Task 13 MVP).
 * Optional DynamoDB tables + OTAVIA_TABLE_* env (runtime table store spec).
 */

export type ResourceTableDeploy = {
  logicalId: string;
  partitionKeyAttr: string;
  rowKeyAttr: string;
  envSuffix: string;
};

function sanitizeEnvKey(k: string): string {
  const s = k.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!/^[a-zA-Z_]/.test(s)) {
    return `E_${s}`;
  }
  return s;
}

function yamlDoubleQuoted(v: string): string {
  const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

function toPascalCaseForCfn(logicalId: string): string {
  return logicalId
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function tableCfnLogicalId(logicalId: string): string {
  return `${toPascalCaseForCfn(logicalId)}Table`;
}

function tableNameSubSlug(logicalId: string): string {
  const s = logicalId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "tbl";
}

function renderDynamoTableResources(tables: ReadonlyArray<ResourceTableDeploy>): string {
  if (tables.length === 0) return "";
  return tables
    .map((t) => {
      const rid = tableCfnLogicalId(t.logicalId);
      const slug = tableNameSubSlug(t.logicalId);
      const pk = t.partitionKeyAttr;
      const rk = t.rowKeyAttr;
      return `  ${rid}:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub '\${AWS::StackName}-${slug}'
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: ${pk}
          AttributeType: S
        - AttributeName: ${rk}
          AttributeType: S
      KeySchema:
        - AttributeName: ${pk}
          KeyType: HASH
        - AttributeName: ${rk}
          KeyType: RANGE
`;
    })
    .join("");
}

function renderDynamoPolicy(tables: ReadonlyArray<ResourceTableDeploy>): string {
  if (tables.length === 0) return "";
  const resources = tables
    .map((t) => `                  - !GetAtt ${tableCfnLogicalId(t.logicalId)}.Arn`)
    .join("\n");
  return `      Policies:
        - PolicyName: OtaviaDynamoDbData
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:BatchGetItem
                  - dynamodb:BatchWriteItem
                  - dynamodb:Scan
                Resource:
${resources}
`;
}

function buildLambdaEnvBlock(
  environments: Record<string, string>,
  tables: ReadonlyArray<ResourceTableDeploy>
): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(environments)) {
    lines.push(`          ${sanitizeEnvKey(k)}: ${yamlDoubleQuoted(v)}`);
  }
  for (const t of tables) {
    const rid = tableCfnLogicalId(t.logicalId);
    lines.push(`          OTAVIA_TABLE_${t.envSuffix}_NAME: !Ref ${rid}`);
    lines.push(
      `          OTAVIA_TABLE_${t.envSuffix}_PARTITION_KEY: ${yamlDoubleQuoted(t.partitionKeyAttr)}`
    );
    lines.push(`          OTAVIA_TABLE_${t.envSuffix}_ROW_KEY: ${yamlDoubleQuoted(t.rowKeyAttr)}`);
  }
  if (lines.length === 0) return "";
  return `\n      Environment:\n        Variables:\n${lines.join("\n")}`;
}

export function buildMinimalHttpLambdaTemplate(input: {
  environments: Record<string, string>;
  resourceTables?: ReadonlyArray<ResourceTableDeploy>;
}): string {
  const tables = input.resourceTables ?? [];
  const dynamoResources = renderDynamoTableResources(tables);
  const dynamoPolicy = renderDynamoPolicy(tables);
  const envBlock = buildLambdaEnvBlock(input.environments, tables);

  return `AWSTemplateFormatVersion: '2010-09-09'
Description: Otavia minimal Lambda (MVP)
Resources:
${dynamoResources}  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
${dynamoPolicy}  HelloFn:
    Type: AWS::Lambda::Function
    Properties:
      Handler: index.handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Runtime: nodejs20.x
      Timeout: 10${envBlock}
      Code:
        ZipFile: |
          exports.handler = async () => ({
            statusCode: 200,
            headers: { 'content-type': 'text/plain' },
            body: 'ok',
          });
  FunctionUrl:
    Type: AWS::Lambda::Url
    Properties:
      AuthType: NONE
      TargetFunctionArn: !GetAtt HelloFn.Arn
  HelloFnUrlInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref HelloFn
      Action: lambda:InvokeFunctionUrl
      FunctionUrlAuthType: NONE
      Principal: '*'

Outputs:
  FunctionUrl:
    Description: Lambda function URL
    Value: !GetAtt FunctionUrl.FunctionUrl
`;
}
