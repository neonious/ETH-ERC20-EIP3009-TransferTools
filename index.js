'use strict';

const fs = require('fs');
const path = require('path');

const ethSigUtil = require('eth-sig-util');

const ERC20_ABI = [
	{
		"inputs": [],
		"name": "version",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "name",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"constant": true,
		"inputs": [{ "name": "_owner", "type": "address" }],
		"name": "balanceOf",
		"outputs": [{ "name": "balance", "type": "uint256" }],
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "recipient",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "transfer",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "decimals",
		"outputs": [
			{
				"internalType": "uint8",
				"name": "",
				"type": "uint8"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"name": "_from",
				"type": "address"
			},
			{
				"indexed": true,
				"name": "_to",
				"type": "address"
			},
			{
				"indexed": false,
				"name": "_value",
				"type": "uint256"
			}
		],
		"name": "Transfer",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "from",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "value",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "validAfter",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "validBefore",
				"type": "uint256"
			},
			{
				"internalType": "bytes32",
				"name": "nonce",
				"type": "bytes32"
			},
			{
				"internalType": "uint8",
				"name": "v",
				"type": "uint8"
			},
			{
				"internalType": "bytes32",
				"name": "r",
				"type": "bytes32"
			},
			{
				"internalType": "bytes32",
				"name": "s",
				"type": "bytes32"
			}
		],
		"name": "transferWithAuthorization",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}];

let erc20Contracts = {}, accounts = {};

exports.isNodeReady = async function isNodeReady(web3) {
	return !await web3.eth.isSyncing();
}

exports.createAddresses = async function createAddresses(web3, count) {
	let addrs = [];
	for (let i = 0; i < count; i++) {
		const addr = await web3.eth.accounts.create();

		addrs.push({ address: addr.address, privateKey: addr.privateKey });
		accounts[addr.privateKey] = addr;
	}

	return addrs;
}

exports.transferDelegated = async function transferDelegated(web3, privateKeyFees, tokenAddr, privateKeyFrom, to, amount, gasPrice, onlyEstimate) {
	let accountFrom = accounts[privateKeyFrom];
	if (!accountFrom)
		accountFrom = accounts[privateKeyFrom] = await web3.eth.accounts.privateKeyToAccount(privateKeyFrom);

	if (!erc20Contracts[tokenAddr])
		erc20Contracts[tokenAddr] = new web3.eth.Contract(ERC20_ABI, tokenAddr);
	const tokenName = await erc20Contracts[tokenAddr].methods.name().call();
	const tokenVersion = await erc20Contracts[tokenAddr].methods.version().call();

	const data = {
		types: {
			EIP712Domain: [
				{ name: "name", type: "string" },
				{ name: "version", type: "string" },
				{ name: "chainId", type: "uint256" },
				{ name: "verifyingContract", type: "address" },
			],
			TransferWithAuthorization: [
				{ name: "from", type: "address" },
				{ name: "to", type: "address" },
				{ name: "value", type: "uint256" },
				{ name: "validAfter", type: "uint256" },
				{ name: "validBefore", type: "uint256" },
				{ name: "nonce", type: "bytes32" },
			],
		},
		domain: {
			name: tokenName,
			version: tokenVersion,
			chainId: await web3.eth.getChainId(),
			verifyingContract: tokenAddr,
		},
		primaryType: "TransferWithAuthorization",
		message: {
			from: accountFrom.address,
			to: to,
			value: amount,
			validAfter: 0,
			validBefore: Math.floor(Date.now() / 1000) + 3600,
			nonce: web3.utils.randomHex(32),
		},
	};

	const signature = ethSigUtil.signTypedData_v4(Buffer.from(privateKeyFrom.substr(2), 'hex'), { data });
	const v = "0x" + signature.slice(130, 132);
	const r = signature.slice(0, 66);
	const s = "0x" + signature.slice(66, 130);

	return await exports.sendPrivateKey(web3, privateKeyFees,
		erc20Contracts[tokenAddr].methods.transferWithAuthorization(accountFrom.address, to, amount, 0, data.message.validBefore, data.message.nonce, v, r, s), tokenAddr, gasPrice, onlyEstimate);
}

exports.transfer = async function transfer(web3, privateKey, tokenAddr, to, amount, gasPrice, onlyEstimate) {
	if (tokenAddr) {
		if (!erc20Contracts[tokenAddr])
			erc20Contracts[tokenAddr] = new web3.eth.Contract(ERC20_ABI, tokenAddr);

		return await exports.sendPrivateKey(web3, privateKey, erc20Contracts[tokenAddr].methods.transfer(to, amount), tokenAddr, gasPrice, onlyEstimate);
	} else {
		const account = await web3.eth.accounts.privateKeyToAccount(privateKey);

		if (onlyEstimate)
			return await web3.eth.estimateGas({
				from: account.address,
				to,
				value: amount
			});

		const createTransaction = await account.signTransaction({
			from: account.address,
			to,
			value: amount,
			gas: await web3.eth.estimateGas({
				from: account.address,
				to,
				value: amount
			}) * 2,
			gasPrice
		});
		await web3.eth.sendSignedTransaction(
			createTransaction.rawTransaction
		);
	}
}

exports.getDecimalFactor = async function getDecimalFactor(web3, tokenAddr) {
	if (tokenAddr) {
		if (!erc20Contracts[tokenAddr])
			erc20Contracts[tokenAddr] = new web3.eth.Contract(ERC20_ABI, tokenAddr);

		const decimals = await erc20Contracts[tokenAddr].methods.decimals().call();
		return Math.pow(10, -decimals);
	} else
		return 1E-18;
}

exports.getBalance = async function getBalance(web3, tokenAddr, addresses, human) {
	let balances = [];

	let only1;
	if (typeof addresses == 'string') {
		addresses = [addresses];
		only1 = true;
	}

	let fac = human ? await exports.getDecimalFactor(web3, tokenAddr) : 1;
	let val;

	for (let i = 0; i < addresses.length; i++) {
		if (tokenAddr) {
			if (!erc20Contracts[tokenAddr])
				erc20Contracts[tokenAddr] = new web3.eth.Contract(ERC20_ABI, tokenAddr);

			val = await erc20Contracts[tokenAddr].methods.balanceOf(addresses[i]).call();
		} else
			val = await web3.eth.getBalance(addresses[i]);

		balances.push(human ? val * fac : val);
	}

	return only1 ? balances[0] : balances;
}

exports.getHistory = async function getHistory(web3, tokenAddr, addresses, fromBlock, human) {
	let fac = human ? await exports.getDecimalFactor(web3, tokenAddr) : 1;
	let res = {
		nextBlock: await web3.eth.getBlockNumber() + 1,
		transfers: []
	};
	if (fromBlock === null || fromBlock === undefined)
		fromBlock = res.nextBlock - 1;

	let addressObj = {}, allAddresses;
	if (typeof addresses == 'string')
		addressObj[addresses] = true;
	else if (addresses)
		for (let i = 0; i < addresses.length; i++)
			addressObj[addresses[i]] = true;
	else
		allAddresses = true;

	if (tokenAddr) {
		if (!erc20Contracts[tokenAddr])
			erc20Contracts[tokenAddr] = new web3.eth.Contract(ERC20_ABI, tokenAddr);

		// To be safe, we do block to block, because otherwise the JSON gets too big for web3
		for (let b = fromBlock | 0; b < res.nextBlock; b++) {
			const raw = await erc20Contracts[tokenAddr].getPastEvents("Transfer", { fromBlock: b, toBlock: b });
			for (let i = 0; i < raw.length; i++)
				if (raw[i].address == tokenAddr && (allAddresses || addressObj[raw[i].returnValues[0]] || addressObj[raw[i].returnValues[1]]))
					res.transfers.push({
						transaction: raw[i].transactionHash,
						from: raw[i].returnValues[0],
						to: raw[i].returnValues[1],
						amount: human ? raw[i].returnValues[2] * fac : raw[i].returnValues[2],
						timestamp: (await web3.eth.getBlock(raw[i].blockNumber)).timestamp
					});
		}
	} else {
		for (let i = fromBlock | 0; i < res.nextBlock; i++) {
			const block = await web3.eth.getBlock(i, true);
			if (block.transactions.length)
				for (let j = 0; j < block.transactions.length; j++) {
					if ((block.transactions[j].value | 0) && (allAddresses || addressObj[block.transactions[j].from] || addressObj[block.transactions[j].to]))
						res.transfers.push({
							transaction: block.transactions[j].hash,
							from: block.transactions[j].from,
							to: block.transactions[j].to,
							amount: human ? block.transactions[j].value * fac : block.transactions[j].value,
							timestamp: block.timestamp
						});
				}
		}
	}

	return res;
}

exports.sendPrivateKey = async function sendPrivateKey(web3, privateKey, query, to, gasPrice, onlyEstimate) {
	let account = accounts[privateKey];
	if (!account)
		account = accounts[privateKey] = await web3.eth.accounts.privateKeyToAccount(privateKey);

	let gas = await query.estimateGas({ from: account.address });
	if (onlyEstimate)
		return gas;

	gas *= 2;
	if (gas > 7000000)
		gas = 7000000;

	const createTransaction = await account.signTransaction({
		from: account.address,
		to,
		data: query.encodeABI(),
		gas,
		gasPrice
	});
	return await web3.eth.sendSignedTransaction(
		createTransaction.rawTransaction
	);
}

exports.deployTestToken = async function deploySimpleToken(web3, privateKey, name, symbol, initialSupply, decimals) {
	const code = JSON.parse(await fs.promises.readFile(path.join(__dirname, 'eip-3009-token.json'), 'utf8'));
	const contract = code.contracts['Token.sol'].Token;

	return await exports.deployContract(web3, privateKey, contract, undefined, false, name, '1', symbol, decimals, initialSupply);
}

exports.deployContract = async function deployContract(web3, privateKey, contract, gasPrice, onlyEstimate, ...args) {
	const contractObj = new web3.eth.Contract(contract.abi);
	const contractTx = contractObj.deploy({
		data: contract.evm.bytecode.object,
		arguments: args
	});

	const receipt = await exports.sendPrivateKey(web3, privateKey, contractTx, undefined, gasPrice, onlyEstimate);
	return onlyEstimate ? receipt : receipt.contractAddress;
}
