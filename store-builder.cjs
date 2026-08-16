const path = require('node:path');

module.exports = {
  appId: 'com.gleysondevs.attozap.wasender',
  productName: 'ATTOZAP WASender Pro',
  asar: true,
  directories: { output: 'release-store', buildResources: 'build' },
  files: ['dist/**/*', 'dist-electron/**/*', 'package.json'],
  extraResources: [{ from: 'resources', to: '.', filter: ['**/*'] }],
  win: {
    icon: 'build/icon.svg',
    target: [{ target: 'appx', arch: ['x64'] }],
    artifactName: 'ATTOZAP-WASender-Pro-${version}-${arch}.${ext}',
  },
  appx: {
    applicationId: 'ATTOZAPWasenderPro',
    identityName: process.env.STORE_IDENTITY_NAME || 'GleysonDevs.ATTOZAPWasenderPro',
    publisher: process.env.STORE_PUBLISHER || 'CN=GleysonDevs',
    publisherDisplayName: process.env.STORE_PUBLISHER_DISPLAY_NAME || 'GleysonDevs',
    displayName: 'ATTOZAP WASender Pro',
    description: 'Ferramentas desktop ATTOZAP para mensageria e produtividade no WhatsApp.',
    backgroundColor: '#7657FF',
    languages: ['pt-BR', 'en-US'],
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    capabilities: ['runFullTrust', 'internetClient', 'privateNetworkClientServer'],
    showNameOnTiles: true,
    artifactName: 'ATTOZAP-WASender-Pro-${version}-${arch}.${ext}',
  },
};
