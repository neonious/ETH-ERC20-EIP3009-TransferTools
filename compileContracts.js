'use strict';

/*
 * compileContracts.js
 *
 * My script to compile eip-3009-token.json from the contract code in eip-3009
 * No need for running it, as eip-3009-token.json is pushed in this repository
 */

const fs = require('fs');
const path = require('path');

const solc = require('solc');

function findImports(dependency) {
	let code;
	try {
		code = fs.readFileSync(path.join(__dirname, 'node_modules', dependency), 'utf8');
	} catch(e) {
		code = fs.readFileSync(path.join(__dirname, 'eip-3009/contracts', dependency), 'utf8');
	}
	return { contents: code };
}

async function compile(file, pathIn, pathOut) {
	const code = await fs.promises.readFile(path.join(__dirname, pathIn), 'utf8');

	let sources = {};
	sources[file] = { content: code };

	const res = JSON.parse(solc.compile(JSON.stringify({
		language: 'Solidity',
		sources,
		settings: { outputSelection: { '*': { '*': ['*'] } } }
	}), { import: findImports }));

	await fs.promises.writeFile(path.join(__dirname, pathOut), JSON.stringify(res, null, 2));
}

async function run() {
	await compile('Token.sol', 'eip-3009/contracts/Token.sol', 'eip-3009-token.json');

	// Needed because solc keeps program running
	process.exit(0);
}
run();
