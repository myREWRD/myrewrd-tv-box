const { validateArtifact } = require('../src/update');
validateArtifact(process.argv[2], process.argv[3]);
console.log('PASS release executable structure, minimum size, and SHA-256. This does not prove installed restart.');
