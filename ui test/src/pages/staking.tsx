import { useState, useEffect, useMemo } from 'react';
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,ConfirmOptions,LAMPORTS_PER_SOL,SystemProgram,clusterApiUrl,SYSVAR_RENT_PUBKEY,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,Token, NATIVE_MINT} from "@solana/spl-token";
import useNotify from './notify'
import * as bs58 from 'bs58'
import * as anchor from "@project-serum/anchor";
import { programs } from '@metaplex/js'
import axios from "axios"

let wallet : any
let conn = new Connection(clusterApiUrl('mainnet-beta'))
let notify: any

const { metadata: { Metadata } } = programs
const programId = new PublicKey('botidfegKtYsu7taaMbYo5rs5Zx6cfrcgeiDZtCrnwv')
const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
const idl = require('./staking.json')
const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}
const STAKING_DATA_SIZE = 8+ 32+32+1+32+8+8+1;

export default function Staking(){
	wallet = useWallet()
	notify = useNotify()

	//4YnWvpPRFypDAjzDbTegBivy6hbDp8UAMRKrCkmvAhdP
	
	// const [rewardToken, setRewardToken] = useState('4YnWvpPRFypDAjzDbTegBivy6hbDp8UAMRKrCkmvAhdP')
	const [rewardToken, setRewardToken] = useState('4YnWvpPRFypDAjzDbTegBivy6hbDp8UAMRKrCkmvAhdP')
	const [rewardAmount, setRewardAmount] = useState('10')
	const [period, setPeriod] = useState('60')
	const [symbol, setSymbol] = useState('solbots')
	const [newPool, setNewPool] = useState('')
	//7m1h1LQ5PfbpxSMqm4o4hzJb7uY53S27BA4iZSv9XTvT
	const [curPool, setCurPool] = useState('7m1h1LQ5PfbpxSMqm4o4hzJb7uY53S27BA4iZSv9XTvT')
	const [poolData, setPoolData] = useState<any>(null)
	const [ownedNfts, setOwnedNfts] = useState<any[]>([])
	const [ownedStakeNfts, setOwnedStakeNfts] = useState<any[]>([])
	const [totalRewardAmount, setTotalRewardAmount] = useState(0)
	const [provider, program] = useMemo(()=>{
		const provider = new anchor.Provider(conn, wallet as any, confirmOption)
		const program = new anchor.Program(idl, programId, provider)
		return [provider, program]
	}, [])

	useEffect(()=>{
		getPoolData()
	},[curPool])

	useEffect(()=>{
		if(poolData!=null && wallet.publicKey!=null){
			getNfts()
		}
	},[poolData, wallet.publicKey])

	useEffect(()=>{
		if(poolData!=null)
		getRewardAmount()
	},[ownedStakeNfts])
	
	const createAssociatedTokenAccountInstruction = (
	  associatedTokenAddress: anchor.web3.PublicKey,
	  payer: anchor.web3.PublicKey,
	  walletAddress: anchor.web3.PublicKey,
	  splTokenMintAddress: anchor.web3.PublicKey
	  ) => {
	  const keys = [
	    { pubkey: payer, isSigner: true, isWritable: true },
	    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
	    { pubkey: walletAddress, isSigner: false, isWritable: false },
	    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
	    {
	      pubkey: anchor.web3.SystemProgram.programId,
	      isSigner: false,
	      isWritable: false,
	    },
	    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
	    {
	      pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
	      isSigner: false,
	      isWritable: false,
	    },
	  ];
	  return new anchor.web3.TransactionInstruction({
	    keys,
	    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
	    data: Buffer.from([]),
	  });
	}
	const getTokenWallet = async (owner: PublicKey,mint: PublicKey) => {
	  return (
	    await PublicKey.findProgramAddress(
	      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
	      ASSOCIATED_TOKEN_PROGRAM_ID
	    )
	  )[0];
	}
	const getMetadata = async (
	  mint: PublicKey
	    ): Promise<PublicKey> => {
	  return (
	    await PublicKey.findProgramAddress(
	      [
	        Buffer.from("metadata"),
	        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
	        mint.toBuffer(),
	      ],
	      TOKEN_METADATA_PROGRAM_ID
	    )
	  )[0];
	};
	async function getDecimalsOfToken(mint : PublicKey){
	   // console.log(mint.toBase58())
	  let resp = await conn.getAccountInfo(mint)
	  let accountData = MintLayout.decode(Buffer.from(resp!.data))
	  return accountData.decimals
	}

	const getPoolData = async() => {
		try{
			const randProvider = new anchor.Provider(conn, new anchor.Wallet(Keypair.generate()), confirmOption)
			const randProgram = new anchor.Program(idl, programId, randProvider)
			const pool = new PublicKey(curPool)
			const pD = await program.account.pool.fetch(pool)
			console.log({
				tokenAccount : pD.rewardAccount.toBase58(),
				owner : pD.owner.toBase58(),
				tokenAmount : pD.rewardAmount.toNumber(),
				period : pD.period.toNumber()
			})
			console.log(pD)
			setPoolData(pD)
		}catch(err){
			setPoolData(null)
		}
	}
	async function getNftsForOwner(
	  owner : PublicKey
	  ){
	  const allTokens: any[] = []
	  if(poolData==null) return allTokens
	  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(owner, {
	    programId: TOKEN_PROGRAM_ID
	  });
	  for (let index = 0; index < tokenAccounts.value.length; index++) {
	    try{
	      const tokenAccount = tokenAccounts.value[index];
	      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;

	      if (tokenAmount.amount == "1" && tokenAmount.decimals == "0") {
	        let nftMint = new PublicKey(tokenAccount.account.data.parsed.info.mint)
	        let pda = await getMetadata(nftMint)
	        const accountInfo: any = await conn.getParsedAccountInfo(pda);
	        let metadata : any = new Metadata(owner.toString(), accountInfo.value);
	        const { data }: any = await axios.get(metadata.data.data.uri)
	        if (metadata.data.data.symbol == poolData.collectionName) {
	          const entireData = { ...data, id: Number(data.name.replace( /^\D+/g, '').split(' - ')[0]) }
	          allTokens.push({address : nftMint, account: tokenAccounts.value[index].pubkey, metadata : metadata.data.data, offChainData : entireData })
	        }
	      }
	      allTokens.sort(function (a: any, b: any) {
	        if (a.name < b.name) { return -1; }
	        if (a.name > b.name) { return 1; }
	        return 0;
	      })
	    } catch(err) {
	      continue;
	    }
	  }
	  console.log(allTokens)
	  return allTokens
	}
	async function getStakedNftsForOwner(
		owner : PublicKey,
		){
		const allTokens : any[] = []
		if(poolData==null) return allTokens
		const walletAddress = wallet.publicKey.toBase58()
		let resp = await conn.getProgramAccounts(programId,{
			dataSlice : {length : 0, offset : 0},
			filters:[
				{dataSize : STAKING_DATA_SIZE},
				{memcmp:{offset:8,bytes:curPool}},
				{memcmp:{offset:73,bytes:walletAddress}}
			]
		})
		for(let nftAccount of resp){
				let stakedNft = await program.account.stakingData.fetch(nftAccount.pubkey)
				if(stakedNft.isStaked == false) continue;
			try{
				let pda = await getMetadata(stakedNft.nftMint)
				const accountInfo: any = await conn.getParsedAccountInfo(pda);
		    let metadata : any = new Metadata(owner.toString(), accountInfo.value);
		    const { data }: any = await axios.get(metadata.data.data.uri)
		    const entireData = { ...data, id: Number(data.name.replace( /^\D+/g, '').split(' - ')[0]) }
		    allTokens.push({address : stakedNft.nftMint, stakingDataAccount : nftAccount.pubkey, metadata : metadata.data.data, offChainData : entireData, stakeTime : stakedNft.stakeTime.toNumber(), claimNumber : stakedNft.claimNumber.toNumber()})
		  }catch(err){
		  	console.log(err)
		  	continue;
		  }
		}
		return allTokens
	}
	async function getNfts(){
		setOwnedNfts(await getNftsForOwner(wallet.publicKey))
		setOwnedStakeNfts(await getStakedNftsForOwner(wallet.publicKey))
	}
	async function getRewardAmount(){
		let total = 0;
		let time = (new Date()).getTime() / 1000
		let decimals = await getDecimalsOfToken(poolData.rewardMint)
		for(let nft of ownedStakeNfts){
			total += poolData.rewardAmount.toNumber() * Math.floor((time-nft.stakeTime)/poolData.period.toNumber())
		}
		setTotalRewardAmount(total / (10 ** decimals))
	}

	const initPool = async() =>{
		try{
			let transaction = new Transaction()
			const rand = Keypair.generate().publicKey;
		  const [pool, bump] = await PublicKey.findProgramAddress([rand.toBuffer()],programId)
		//   const rewardMint = new PublicKey(rewardToken)
		  const rewardMint = new PublicKey(rewardToken)
		  const rewardPoolAccount = await getTokenWallet(pool, rewardMint)
		  transaction.add(createAssociatedTokenAccountInstruction(rewardPoolAccount,wallet.publicKey, pool, rewardMint))
		  let decimals = await getDecimalsOfToken(rewardMint)
		  transaction.add(program.instruction.initPool(
		  	new anchor.BN(bump),
		  	new anchor.BN(Number(rewardAmount) * (10 ** decimals)),
		  	new anchor.BN(period),
			false,
		  	symbol,
		  	PublicKey.default,
		  	{
		  		accounts:{
		  			owner : wallet.publicKey,
		  			pool : pool,
		  			rand : rand,
		  			rewardMint : rewardMint,
		  			rewardAccount : rewardPoolAccount,
		  			systemProgram : SystemProgram.programId,
		  		}
		  	}
		  ))
		  await sendTransaction(transaction, [])
		  notify('success', 'Success!')
		  setNewPool(pool.toBase58())
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	const SetPool = async() =>{
		try{
			let transaction = new Transaction()
			const rand = Keypair.generate().publicKey;
		  const pool = new PublicKey(curPool);
		  const rewardMint = new PublicKey(rewardToken)
		  const rewardPoolAccount = await getTokenWallet(pool, rewardMint)
		//   transaction.add(createAssociatedTokenAccountInstruction(rewardPoolAccount,wallet.publicKey, pool, rewardMint))
		  let decimals = await getDecimalsOfToken(rewardMint)
		//   console.log("decimal", decimals)
		  transaction.add(program.instruction.setPool(
		  	new anchor.BN(Number(rewardAmount) * (10 ** decimals)),
		  	new anchor.BN(period),
			false,
		  	symbol,
		  	PublicKey.default,
		  	{
		  		accounts:{
		  			owner : wallet.publicKey,
		  			pool : pool,
		  			rewardMint : rewardMint,
		  			rewardAccount : rewardPoolAccount,
		  			systemProgram : SystemProgram.programId,
		  		}
		  	}
		  ))
		  await sendTransaction(transaction, [])
		  notify('success', 'Success!')
		  setNewPool(pool.toBase58())
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	const stake = async(nftMint : PublicKey, nftAccount : PublicKey)=>{
		try{
			let transaction = new Transaction()
			const pool = new PublicKey(curPool)
			const [stakingData, bump] = await PublicKey.findProgramAddress([nftMint.toBuffer(), pool.toBuffer()],programId)
			
			let balance : any = await conn.getBalance(wallet.publicKey);
			const decimals : number = 9;

			if(balance > Math.pow(10, decimals)) {
				balance -= Math.pow(10, decimals - 1);
			} else {
				balance = 0;
			}

				if((await conn.getAccountInfo(stakingData)) == null){
				const metadata = await getMetadata(nftMint)
				// console.log(metadata)
				transaction.add(program.instruction.initStakingData(
					new anchor.BN(bump),
					{
						accounts:{
							owner : wallet.publicKey,
							pool : pool,
							nftMint : nftMint,
							metadata : metadata,
							stakingData : stakingData,
							systemProgram : SystemProgram.programId,
						}
					}
				))
			}
			let nftTo = await getTokenWallet(pool, nftMint)
			if((await conn.getAccountInfo(nftTo)) == null)
				transaction.add(createAssociatedTokenAccountInstruction(nftTo,wallet.publicKey, pool, nftMint))
			transaction.add(program.instruction.stake(
				new anchor.BN(balance),
				{
				accounts:{
					owner : wallet.publicKey,
					pool : pool,
					stakingData : stakingData,
					nftFrom : nftAccount,
					nftTo : nftTo,
					tokenProgram : TOKEN_PROGRAM_ID,
					systemProgram : SystemProgram.programId,
					clock : SYSVAR_CLOCK_PUBKEY,
				}
			}))
			await sendTransaction(transaction, [])
		  notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	const unstake = async(nftMint : PublicKey) => {
		try{
			let transaction = new Transaction()
			const pool = new PublicKey(curPool)
			const [stakingData, bump] = await PublicKey.findProgramAddress([nftMint.toBuffer(), pool.toBuffer()],programId)
			let nftFrom = await getTokenWallet(pool, nftMint)
			let tokenFrom = await getTokenWallet(pool, poolData.rewardMint)
			let balance : any = await conn.getBalance(wallet.publicKey);
			const decimals = 9;

			if(balance > Math.pow(10, decimals)) {
			balance -= Math.pow(10, decimals - 1);
			} else {
			balance = 0;
			}

			let nftTo = await getTokenWallet(wallet.publicKey, nftMint)
			if((await conn.getAccountInfo(nftTo)) == null)
				transaction.add(createAssociatedTokenAccountInstruction(nftTo,wallet.publicKey, wallet.publicKey, nftMint))
			
			let tokenTo = await getTokenWallet(wallet.publicKey, poolData.rewardMint)
			if((await conn.getAccountInfo(tokenTo))==null){
				transaction.add(createAssociatedTokenAccountInstruction(tokenTo, wallet.publicKey, wallet.publicKey, poolData.rewardMint))
			}

			transaction.add(program.instruction.unstake(
				new anchor.BN(balance),
				{
				accounts:{
					owner : wallet.publicKey,
					pool : pool,
					stakingData: stakingData,
					nftFrom : nftFrom,
					nftTo : nftTo,
					tokenFrom : tokenFrom,
					tokenTo : tokenTo,
					tokenProgram : TOKEN_PROGRAM_ID,
					systemProgram : SystemProgram.programId,
					clock : SYSVAR_CLOCK_PUBKEY
				}
			}))
			await sendTransaction(transaction, [])
		  notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	const claim = async() => {
		try{
			let transactions : Transaction[] = []
			const pool = new PublicKey(curPool)
			// const [stakingData, bump] = await PublicKey.findProgramAddress([nftMint.toBuffer(), pool.toBuffer()],programId)
			let tokenTo = await getTokenWallet(wallet.publicKey, poolData.rewardMint)
			if((await conn.getAccountInfo(tokenTo))==null){
				let tx = new Transaction()
				tx.add(createAssociatedTokenAccountInstruction(tokenTo, wallet.publicKey, wallet.publicKey, poolData.rewardMint))
				transactions.push(tx)
			}

			let balance : any = Math.pow(10, 2);
			console.log("balance", balance);
			ownedStakeNfts.map((nft,idx)=>{
				let transaction = new Transaction()
				transaction.add(program.instruction.claim(
					new anchor.BN(balance), {
					accounts:{
						owner : wallet.publicKey,
						pool : pool,
						poolAddress : pool,
						stakingData : nft.stakingDataAccount,
						tokenFrom : new PublicKey(poolData.rewardAccount),
						tokenTo : tokenTo,
						tokenProgram : TOKEN_PROGRAM_ID,
						clock : SYSVAR_CLOCK_PUBKEY
					}
				}))
				transactions.push(transaction)
			})
			console.log("transactions", transactions)
			await sendAllTransaction(transactions)
		  notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}		
	}

	const setFlag = async() => {
		try{
			let transactions : Transaction[] = []
			const pool = new PublicKey(curPool)
			let transaction = new Transaction()
			transaction.add(program.instruction.setPause(
				false, {
				accounts:{
					owner : wallet.publicKey,
					pool : pool
				}
			}))
			transactions.push(transaction)
			console.log(transactions)
			await sendAllTransaction(transactions)
		  notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error', 'Failed Instruction!')
		}		
	}

	async function sendTransaction(transaction : Transaction, signers : Keypair[]) {
		transaction.feePayer = wallet.publicKey
		transaction.recentBlockhash = (await conn.getRecentBlockhash('max')).blockhash;
		await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
		if(signers.length != 0) await transaction.partialSign(...signers)
		const signedTransaction = await wallet.signTransaction(transaction);
		let hash = await conn.sendRawTransaction(await signedTransaction.serialize());
		await conn.confirmTransaction(hash);
		return hash
	}
  async function sendAllTransaction(transactions : Transaction[]){
    let unsignedTxns : Transaction[] = []
    let block = await conn.getRecentBlockhash('max');
    for(let i =0; i<transactions.length;i++){
        let transaction = transactions[i]
        transaction.recentBlockhash = block.blockhash;
        transaction.setSigners(wallet.publicKey)
        unsignedTxns.push(transaction)
    }
    const signedTxns = await wallet.signAllTransactions(unsignedTxns)
    for(let i=0;i<signedTxns.length;i++){
        let hash = await conn.sendRawTransaction(await signedTxns[i].serialize())
        await conn.confirmTransaction(hash)
    }
	}

	return <div className="container-fluid mt-4 row">
		<h4>CREATE NFT STAKING POOL</h4>
		<div className="row mb-5">
			<div className="input-group">
        <span className="input-group-text">Reward Token</span>
        <input name="rewardToken"  type="text" className="form-control" onChange={(event)=>{setRewardToken(event.target.value)}} value={rewardToken}/>
	    </div>
	    <div className="input-group">
        <span className="input-group-text">Reward Amount</span>
        <input name="rewardAmount"  type="text" className="form-control" onChange={(event)=>{setRewardAmount(event.target.value)}} value={rewardAmount}/>
	    	<span className="input-group-text">$LPC</span>
	    </div>
	    <div className="input-group">
        <span className="input-group-text">Period</span>
        <input name="period"  type="text" className="form-control" onChange={(event)=>{setPeriod(event.target.value)}} value={period}/>
        <span className="input-group-text">sec</span>
	    </div>
	    <div className="input-group">
        <span className="input-group-text">Collection Symbol</span>
        <input name="rewardAmount"  type="text" className="form-control" onChange={(event)=>{setSymbol(event.target.value)}} value={symbol}/>
	    </div>
		  	<div className="row container-fluid mb-3 p-3">
				<button type="button" disabled={!(wallet && wallet.connected)} className="btn btn-primary mb3" onClick={async ()=>{
					await initPool()
				}}>CREATE POOL</button>
			</div>
			<div className="row container-fluid mb-3 p-3">
				<button type="button" disabled={!(wallet && wallet.connected)} className="btn btn-primary mb3" onClick={async ()=>{
					await SetPool()
				}}>SET POOL</button>
			</div>
			<h6>{newPool}</h6>
	  </div>
	  <hr/>
	 	<h4>STAKING ENGINE</h4>
	 	<div className="input-group mb-3">
      <span className="input-group-text">POOL</span>
      <input name="curPool"  type="text" className="form-control" onChange={(event)=>{setCurPool(event.target.value)}} value={curPool}/>
    </div>
    <h4>{"Total reward amount : " + totalRewardAmount}</h4>
    <div className="row container-fluid mb-3 p-3">
			<button type="button" disabled={!(wallet && wallet.connected)} className="btn btn-primary mb3" onClick={async ()=>{
				await claim()
			}}>CLAIM REWARD</button>
		</div>
	<div className="row container-fluid mb-3 p-3">
		<button type="button" disabled={!(wallet && wallet.connected)} className="btn btn-primary mb3" onClick={async ()=>{
			await setFlag()
		}}>Set Flag</button>
	</div>
    <div className="row">
    	<div className="col-lg-6">
    		<h5>MY WALLET NFT(s)</h5>
    		<div className="row">
    		{
    			ownedNfts.map((nft,idx)=>{
    				return <div className="card m-3" key={idx} style={{"width" : "250px"}}>
							<img className="card-img-top" src={nft.offChainData.image} alt="Image Error"/>
							<div className="card-img-overlay">
								<h4>{nft.offChainData.name}</h4>
								<button type="button" className="btn btn-success" onClick={async ()=>{
									await stake(nft.address, nft.account)
									await getNfts()
								}}>Stake</button>
							</div>
						</div>
    			})
    		}
    		</div>
    	</div>
    	<div className="col-lg-6">
    		<h5>MY STAKED NFT(s)</h5>
    		<div>
    		{
    			ownedStakeNfts.map((nft,idx)=>{
    				return <div className="card m-3" key={idx} style={{"width" : "250px"}}>
							<img className="card-img-top" src={nft.offChainData.image} alt="Image Error"/>
							<div className="card-img-overlay">
								<h4>{nft.offChainData.name}</h4>
								<button type="button" className="btn btn-success" onClick={async ()=>{
									await unstake(nft.address)
									await getNfts()
								}}>Unstake</button>
							</div>
						</div>
    			})
    		}
    		</div>
    	</div>
    </div>
	</div>
}