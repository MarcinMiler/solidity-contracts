import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const setup = async (owners: string[], numOfConfirmations: number) => {
    const MultisigWallet = await ethers.getContractFactory('MultisigWallet');
    const multisigWallet = await MultisigWallet.deploy(
        owners,
        numOfConfirmations
    );

    return {
        multisigWallet,
    };
};

describe('Multisig Wallet', () => {
    let owner1: SignerWithAddress;
    let owner2: SignerWithAddress;
    let owner3: SignerWithAddress;
    let externalWallet: SignerWithAddress;
    let owners: string[] = [];
    const requiredNumOfConfimations = 3;

    beforeEach(async () => {
        [owner1, owner2, owner3, externalWallet] = await ethers.getSigners();
        owners = [owner1, owner2, owner3].map(({ address }) => address);
    });

    it('should set correct owners and number of confirmation', async () => {
        const { multisigWallet } = await setup(
            owners,
            requiredNumOfConfimations
        );
        const walletOwners = await multisigWallet.getOwners();
        const walletNumberOfConfirmations =
            await multisigWallet.requiredNumOfConfirmations();
        expect(walletOwners).to.deep.eq(owners);
        expect(walletNumberOfConfirmations).to.eq(requiredNumOfConfimations);
    });

    it('should create transaction', async () => {
        const { multisigWallet } = await setup(
            owners,
            requiredNumOfConfimations
        );

        const expectedTransaction = {
            to: externalWallet.address,
            value: BigNumber.from(1),
            data: '0x',
            executed: false,
            numberOfConfirmations: BigNumber.from(0),
        };

        await multisigWallet.submitTransaction(
            expectedTransaction.to,
            expectedTransaction.value,
            ethers.utils.toUtf8Bytes('')
        );

        const tx = await multisigWallet.getTransaction(0);

        expect({
            to: tx.to,
            value: tx.value,
            data: tx.data,
            executed: tx.executed,
            numberOfConfirmations: tx.numberOfConfirmations,
        }).to.deep.eq(expectedTransaction);
    });
});
