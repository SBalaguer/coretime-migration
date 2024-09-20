// Import
import { ApiPromise, WsProvider } from '@polkadot/api';
import { argv } from 'node:process';
import parachainsInfo from './parachains.json' assert { type: "json" };

let parachains = parachainsInfo.polkadot;

const wsProviderPolkadot = new WsProvider('wss://rpc.polkadot.io');
const api = await ApiPromise.create({ provider: wsProviderPolkadot });

const wsProviderPolkadotCoretime = new WsProvider('wss://polkadot-coretime-rpc.polkadot.io');
const apiCoretime = await ApiPromise.create({ provider: wsProviderPolkadotCoretime });


// These are to be sourced by querying the chain when available. For now they are an educated guess.
// Sale starts will be pushed by 1 week because of a runtime upgrade, although this needs to happen before interlude_lengh after sale_start.
// I'll use the current sale start + interlude_length - 1 as a proxy of the maximum time available, but this could be less for teams.
// Current sale start is 22793600
// Interlude_length is 50400 blocks on the coretime chain (1B / 12s) therefore 100800 blocks on the relay chain
const CORETIME_SALES_START = 22602000
const REGION_LENGTH = 5040;
const TIMESLICE_LENGTH = 80;

async function main() {
    // Get on-chain constants
    const { slotOffset, leasePeriodDuration } = await getConstants();

    // Get last Nlock Number
    const { lastBlockNumber } = await getCurrentBlockHeight()

    //Calculate current lease period
    const currentLeasePeriod = Math.floor((lastBlockNumber - slotOffset) / leasePeriodDuration);

    const { allRemainingLeases } = await remainingLeases(currentLeasePeriod, slotOffset, leasePeriodDuration)

    const { coretimeParaInfo } = calculateCoretimeTime(allRemainingLeases, slotOffset, leasePeriodDuration);

    const { currentLeases } = await coretimeLeases()
    console.log(currentLeases)

    const comparaParaInfo = coretimeParaInfo.map(paraInfo => {
        const paraLease = currentLeases.filter(paraLease => paraLease.paraID === paraInfo.paraID)
        if (paraLease.length){
            return {
                ...paraInfo,
                currentLease: paraLease[0].timeslice,
                timesliceDiff: paraInfo.coreUntilTimeslice - paraLease[0].timeslice
            }
        } else {
            return {
                ...paraInfo,
                currentLease: "NA"
            }
        }
    })

    const coresSummary = {}
    let totalCount = 0;
    coretimeParaInfo.map(paraInfo => {
        totalCount = totalCount + 1
        coresSummary[paraInfo.renewCoreAtSaleCycle] ? 
            coresSummary[paraInfo.renewCoreAtSaleCycle] = coresSummary[paraInfo.renewCoreAtSaleCycle] + 1 : 
            coresSummary[paraInfo.renewCoreAtSaleCycle] = 1;
    })

    console.log("**************************")
    console.log("** CORETIME RENOVATIONS **")
    console.log("**************************")

    console.log("ESTIMATED CORETIME SALE START ->", CORETIME_SALES_START)
    console.log();
    console.log("TOTAL ACTIVE CORES -> ", totalCount)
    console.log()
    console.log("CORES SUMMARY -> Number of estimated renewals per sale cycle.")
    console.log(coresSummary)
    console.log()
    console.log("PARAID DETAILS")
    // console.log(coretimeParaInfo)
    console.log(comparaParaInfo)

}

const getConstants = async () => {
    //if there's an offset, in number of blocks, to the start of the first lease period.
    const slotOffset = await api.consts.slots.leaseOffset.toNumber();

    //how long a lease period is, in blocks.
    const leasePeriodDuration = await api.consts.slots.leasePeriod.toNumber();

    return { slotOffset, leasePeriodDuration }
}

const remainingLeases = async (clp) => {
    const paraLeases = await api.query.slots.leases.entries();
    const allRemainingLeases = {};
    paraLeases.forEach(([{ args: [paraID] }, leases]) => {
        const humanParaID = convertToNumber(paraID.toHuman());
        const humanLeases = leases.toHuman();
        const remainingLeases = humanLeases.length;
        //we need to remove 1, as it's being counted on the array already.
        const lastLease = remainingLeases !== 0 ? clp + remainingLeases - 1 : 0;

        if (lastLease === 0) { return }

        const keys = Object.keys(allRemainingLeases);

        //object:
        // {remaining_leases:[paraid1,...paraidn]}
        const paraName = findParaName(humanParaID)

        if (keys.includes(String(lastLease))) {
            allRemainingLeases[lastLease] = [...allRemainingLeases[lastLease], { paraID: humanParaID, name: paraName }]
        } else {
            allRemainingLeases[lastLease] = [{ paraID: humanParaID, name: paraName }]
        }
    });

    return { allRemainingLeases }
}

const calculateCoretimeTime = (leases, so, lpd) => {
    // object:
    // {LP: [{para1}, {para2}, ... , {paran}]}
    // objective:
    // [{para1}, {para2}, ... , {paran} ]

    // Migration does it like so: 
    // https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/runtime/parachains/src/coretime/migration.rs#L228-L247

    const coretimeParaInfo = []

    Object.keys(leases).map(leaseString => {
        const lease = Number(leaseString)
        leases[leaseString].map(paraInfo => {
            //we need to now add one to the LPs as we want to now when is the last block of the lease, and thet we remove one from the total block count.
            const lastLeaseBlock = (lease + 1) * lpd + so - 1;
            const untilSaleRaw = (lastLeaseBlock - CORETIME_SALES_START) / (REGION_LENGTH * TIMESLICE_LENGTH) + 1
            const untilSale = Math.ceil(untilSaleRaw)
            if (untilSaleRaw > 2) {
                const untilSaleBlock = CORETIME_SALES_START + (REGION_LENGTH * TIMESLICE_LENGTH) * (untilSale - 1)
                coretimeParaInfo.push({ ...paraInfo, oldLeaseLastBlock:lastLeaseBlock+1 ,coreUntilBlock: untilSaleBlock, coreUntilTimeslice: (lastLeaseBlock+1)/TIMESLICE_LENGTH, renewCoreAtSaleCycle: untilSale - 1 })
            } else if (untilSaleRaw > 1){
                const untilSaleBlock = CORETIME_SALES_START + (REGION_LENGTH * TIMESLICE_LENGTH) * (untilSale)
                coretimeParaInfo.push({ ...paraInfo, oldLeaseLastBlock:lastLeaseBlock+1, coreUntilBlock: untilSaleBlock, coreUntilTimeslice: (lastLeaseBlock+1)/TIMESLICE_LENGTH, renewCoreAtSaleCycle: untilSale })
            } else {
                coretimeParaInfo.push({ ...paraInfo, oldLeaseLastBlock:lastLeaseBlock+1, coreUntilBlock: lastLeaseBlock + 1, renewCoreAtSaleCycle: "Buys on Open Market" })
            }
        })
    })


    return { coretimeParaInfo }
}

const coretimeLeases = async () => {
    const leases = await (await apiCoretime.query.broker.leases()).toHuman()
    const currentLeases = []

    leases.map(lease => {
        currentLeases.push({
            paraID: convertToNumber(lease.task),
            timeslice: convertToNumber(lease.until)
        })
    })

    return { currentLeases }
}

const getCurrentBlockHeight = async () => {
    const lastBlockHeader = await api.rpc.chain.getHeader();
    const lastBlockNumber = convertToNumber(lastBlockHeader.number.toHuman());

    return { lastBlockNumber }
}

const findParaName = (paraID) => {
    const paraName = parachains.filter(paraInfo => paraInfo.paraid === paraID)

    return paraName.length ? paraName[0].name : "NA"
}

const convertToNumber = (input) => {
    return Number(input.split(",").join(""));
}

main().catch(console.error).finally(() => process.exit());