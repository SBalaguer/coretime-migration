# Coretime Migration

This repository intends to calculate, given an estimated block height for the start of coretime sales, until when each paraID will have a core on the relay chain.

## Usage
1. Clone this repository
2. Install dependencies with `npm install`
3. Run the project
    - For Polkadot: [not avaible yet]
    - For Kusama: `npm run start` or `npm run start chain=kusama`


## Methodology
Coretime sale cycles are dictated by the region length, given by the amount of timeslices in a region and the amount of blocks on a timeslice.

```rust=
region_length = 5040 timeslice
timeslice = 80 blocks
```

At the same time, coretime sales are set to start at a specific block height. So `sale1` will start at `block_height = X`, and `sale2` will start at `block_height = X+region_length`.

If the objective is to calculat eat which block height does a specific `n` sale start, then the above can be represented as:

```rust=
    saleBlock = CORETIME_SALES_START + (region_length * timeslice) * (n-1)
    
    where:
    - CORETIME_SALES_START is the time at which the first sale starts
    - region_length is the length in timeslices of a region
    - timesice is the number of blocks on a timeslice
    - n is the targeted sale
```

## Parachains
Currently each parachain on Polkadot has a slot measured in Lease Periods. Therefore there needs to be a translation from the current Lease Periods to the intended coretime sale cycles. 

The [coretime migration code](https://github.com/paritytech/polkadot-sdk/blob/cc1e6ac301ea88e3cb3253a84e4c6aa28f2d8f87/substrate/frame/broker/src/tick_impls.rs#L217-L221) it's designed to allow teams to have a core until the next available sale start. So if a specific lease period ends at block X which is between sales Y and Z (with Z > Y), then this team will have a core assigned until sales at block Z start, and will have to renew during the sales at block Y.

This has been the bases of the calculation of this tool.

## Output
The output of the tool looks something like this:

```rust=
{
    paraID: 2084,
    name: 'Calamari',
    coreUntilBlock: 23160700,
    renwCoreAtSaleNumber: 1
},

```

Each paraID that has a slot on Kusama and or Polkadot will be represented on this list. The output shows until which block the paraID has a core (`coreUntilBlock`) and at which coretime sale the paraID has to renew it's core. 

In this case, paraID 2084 will have a core until block 23_160_700, however will have to renew this core during sale cycle 1.

> IMPORTANT :warning: 
> This tool has a fixed estimated time of coretime sales [here](https://github.com/SBalaguer/coretime-migration/blob/6babf1f0b53efb32f7db63e331640c9cb4de7d26/index.js#L43). If neeed be, change this number accordingly when using it.

