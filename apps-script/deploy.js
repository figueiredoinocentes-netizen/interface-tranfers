#!/usr/bin/env node
// Automatiza: clasp push + atualiza o deployment "Production v2" para a nova versão
// Uso: node deploy.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_ID = '1iNY3S5S6KMvHb72bNHNowgGafpoZiHvabcsCCbJL0AfYgL15aJ2x3i8E';
const DEPLOYMENT_ID = 'AKfycbzlXKePkQ0doW6w6N9Z2i13qZTDJrayAYj-DWoEUT37t1NLgyqK2FQveAt542OGHJn4IQ';

async function getAccessToken() {
  const clasprc = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8'));
  const creds = clasprc.tokens.default;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Falha a obter access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function getLatestVersion(token) {
  const res = await fetch(
    `https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const versions = data.versions || [];
  return Math.max(...versions.map(v => v.versionNumber));
}

async function updateDeployment(token, versionNumber) {
  const res = await fetch(
    `https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments/${DEPLOYMENT_ID}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: SCRIPT_ID,
          versionNumber,
          manifestFileName: 'appsscript',
          description: 'Production v2'
        }
      })
    }
  );
  return await res.json();
}

async function main() {
  console.log('📤 A fazer push do código...');
  execSync('clasp push --force', { stdio: 'inherit', cwd: __dirname });

  console.log('🔑 A obter token de acesso...');
  const token = await getAccessToken();

  console.log('🔢 A verificar última versão...');
  const version = await getLatestVersion(token);
  console.log(`   Versão mais recente: ${version}`);

  console.log(`🚀 A atualizar deployment para versão ${version}...`);
  const result = await updateDeployment(token, version);

  if (result.deploymentId) {
    console.log('✅ Deployment atualizado com sucesso!');
  } else {
    console.error('❌ Erro:', JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
