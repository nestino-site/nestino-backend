import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';
import * as React from 'react';

export type OtpEmailProps = {
  otp: string;
  villaName?: string;
};

export default function OtpEmail({ otp, villaName }: OtpEmailProps): React.ReactElement {
  const greeting = villaName?.trim() ? `Sign in to ${villaName.trim()}` : 'Sign in to your villa';

  return (
    <Html lang="en">
      <Head />
      <Preview>Your one-time login code</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading style={title}>{greeting}</Heading>
            <Text style={paragraph}>Use this code to complete your login. It expires in 5 minutes.</Text>
            <Section style={codeBox}>
              <Text style={codeText}>{otp}</Text>
            </Section>
            <Text style={muted}>
              If you did not request this email, you can safely ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f4f4f5',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '480px',
};

const card = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '32px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const title = {
  fontSize: '20px',
  fontWeight: 600,
  color: '#18181b',
  margin: '0 0 16px',
};

const paragraph = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#3f3f46',
  margin: '0 0 24px',
};

const codeBox = {
  backgroundColor: '#f4f4f5',
  borderRadius: '6px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const codeText = {
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '8px',
  color: '#18181b',
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

const muted = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#71717a',
  margin: 0,
};
