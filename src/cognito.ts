const REGION    = (import.meta.env.VITE_COGNITO_REGION    as string | undefined) ?? "us-east-1";
const CLIENT_ID = (import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined) ?? "";
const ENDPOINT  = `https://cognito-idp.${REGION}.amazonaws.com/`;

async function cognitoReq(target: string, body: object): Promise<Record<string, unknown>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data.message as string) || (data.__type as string) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const data = await cognitoReq("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  const result = (data.AuthenticationResult as Record<string, string>);
  return {
    email,
    accessToken:  result.AccessToken,
    refreshToken: result.RefreshToken,
  };
}

export async function signUp(email: string, password: string): Promise<void> {
  await cognitoReq("SignUp", {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await cognitoReq("ConfirmSignUp", {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
}
