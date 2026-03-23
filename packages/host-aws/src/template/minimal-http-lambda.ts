/**
 * Minimal Lambda + function URL CloudFormation (Task 13 MVP).
 */
export function buildMinimalHttpLambdaTemplate(input: {
  environments: Record<string, string>;
}): string {
  const envBlock =
    Object.keys(input.environments).length === 0
      ? ""
      : `\n      Environment:\n        Variables:\n${Object.entries(input.environments)
          .map(([k, v]) => `          ${sanitizeEnvKey(k)}: ${yamlDoubleQuoted(v)}`)
          .join("\n")}`;

  return `AWSTemplateFormatVersion: '2010-09-09'
Description: Otavia minimal Lambda (MVP)
Resources:
  LambdaExecutionRole:
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
  HelloFn:
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
