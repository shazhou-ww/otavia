export function handler(): { statusCode: number; body: string } {
  const response = { message: "Hello from Otavia!" };
  return { 
    statusCode: 200, 
    body: JSON.stringify(response)
  };
}
