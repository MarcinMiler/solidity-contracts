import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

const setup = async (owners: string[], numOfConfirmations: number) => {
    const MultisigWallet = await ethers.getContractFactory('MultisigWallet')
    const multisigWallet = await MultisigWallet.deploy(owners, numOfConfirmations)

    return {
        multisigWallet,
    }
}

describe('Multisig Wallet', () => {
    let owner1: SignerWithAddress
    let owner2: SignerWithAddress
    let owner3: SignerWithAddress
    let externalWallet: SignerWithAddress
    let externalWallet2: SignerWithAddress
    let owners: string[] = []
    const requiredNumOfConfimations = 2
    const initialWalletBalance = ethers.utils.parseEther('10000')

    beforeEach(async () => {
        ;[owner1, owner2, owner3, externalWallet, externalWallet2] = await ethers.getSigners()
        owners = [owner1, owner2, owner3].map(({ address }) => address)
    })

    it('should set correct owners and number of confirmation', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)
        const walletOwners = await multisigWallet.getOwners()
        const walletNumberOfConfirmations = await multisigWallet.requiredNumOfConfirmations()
        expect(walletOwners).to.deep.eq(owners)
        expect(walletNumberOfConfirmations).to.eq(requiredNumOfConfimations)
    })

    it('should revert when there is more required confirmations than owners', async () => {
        const MultisigWallet = await ethers.getContractFactory('MultisigWallet')
        await expect(MultisigWallet.deploy(owners, 10)).to.be.revertedWith('invalid number of confirmations')
    })

    it('should revert when one of the addresses is 0 address', async () => {
        const MultisigWallet = await ethers.getContractFactory('MultisigWallet')
        await expect(MultisigWallet.deploy([owner1.address, ethers.constants.AddressZero], 1)).to.be.revertedWith(
            'invalid owner address'
        )
    })

    it('should revert when at least one of owner is duplicated', async () => {
        const MultisigWallet = await ethers.getContractFactory('MultisigWallet')
        await expect(MultisigWallet.deploy([owner1.address, owner2.address, owner1.address], 2)).to.be.revertedWith(
            'duplicated owner'
        )
    })

    it('should revert when there is no owners to set', async () => {
        const MultisigWallet = await ethers.getContractFactory('MultisigWallet')

        await expect(MultisigWallet.deploy([], 1)).to.be.revertedWith('owners required')
    })

    it('should create transaction', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        const expectedTransaction = {
            to: externalWallet.address,
            value: BigNumber.from(1),
            data: '0x',
            executed: false,
            numberOfConfirmations: BigNumber.from(0),
        }

        expect(
            await multisigWallet.submitTransaction(
                expectedTransaction.to,
                expectedTransaction.value,
                ethers.utils.toUtf8Bytes('')
            )
        )
            .to.emit(multisigWallet, 'SubmitTransaction')
            .withArgs(owner1.address, 0, expectedTransaction.to, expectedTransaction.value, expectedTransaction.data)

        const tx = await multisigWallet.getTransaction(0)

        expect({
            to: tx.to,
            value: tx.value,
            data: tx.data,
            executed: tx.executed,
            numberOfConfirmations: tx.numberOfConfirmations,
        }).to.deep.eq(expectedTransaction)
    })

    it('should revert when non owner tries to submit transaction', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await expect(
            multisigWallet
                .connect(externalWallet)
                .submitTransaction(externalWallet.address, ethers.utils.parseEther('1'), ethers.utils.toUtf8Bytes(''))
        ).to.be.revertedWith('not owner')
    })

    it('should confirm transaction by one of the owners', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await multisigWallet.submitTransaction(externalWallet.address, 2, ethers.utils.toUtf8Bytes(''))

        expect(await multisigWallet.connect(owner2).confirmTransaction(0))
            .to.emit(multisigWallet, 'ConfirmTransaction')
            .withArgs(owner2.address, 0)

        const tx = await multisigWallet.getTransaction(0)
        const isConfirmedByOwner2 = await multisigWallet.isConfirmed(0, owner2.address)

        expect(tx.numberOfConfirmations).to.eq(1)
        expect(isConfirmedByOwner2).to.eq(true)
    })

    it('should revert when user tries to confirm transaction which does not exist', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await expect(multisigWallet.confirmTransaction(10)).to.be.revertedWith('tx does not exist')
    })

    it('should revoke confimration when user already confirmed transaction', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await multisigWallet.submitTransaction(externalWallet.address, 2, ethers.utils.toUtf8Bytes(''))

        await multisigWallet.connect(owner2).confirmTransaction(0)

        expect(await multisigWallet.connect(owner2).revokeConfirmation(0))
            .to.emit(multisigWallet, 'RevokeConfirmation')
            .withArgs(owner2.address, 0)

        const isConfirmed = await multisigWallet.isConfirmed(0, owner2.address)

        expect(isConfirmed).to.eq(false)
    })

    it('should revert when owner tries to revoke confimation that is not confimed by him', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await multisigWallet.submitTransaction(externalWallet.address, 2, ethers.utils.toUtf8Bytes(''))

        await multisigWallet.connect(owner3).confirmTransaction(0)

        await expect(multisigWallet.connect(owner2).revokeConfirmation(0)).to.be.revertedWith(
            'transaction not confirmed'
        )
    })

    it('should execute transaction after required number of confirmations by other owners', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        const etherToSendFromMultisigWallet = ethers.utils.parseEther('2')

        await owner1.sendTransaction({
            to: multisigWallet.address,
            value: ethers.utils.parseEther('10'),
        })

        await multisigWallet.submitTransaction(
            externalWallet2.address,
            etherToSendFromMultisigWallet,
            ethers.utils.toUtf8Bytes('')
        )

        await multisigWallet.connect(owner2).confirmTransaction(0)
        await multisigWallet.connect(owner3).confirmTransaction(0)

        expect(await multisigWallet.executeTransaction(0))
            .to.emit(multisigWallet, 'ExecuteTransaction')
            .withArgs(owner1.address, 0)

        const tx = await multisigWallet.getTransaction(0)
        const balance = await externalWallet2.getBalance()

        expect(tx.executed).to.eq(true)
        expect(tx.numberOfConfirmations).to.eq(2)
        expect(balance).to.deep.eq(initialWalletBalance.add(etherToSendFromMultisigWallet))
    })

    it('should revert when transaction does not have enough confimrations', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        const etherToSendFromMultisigWallet = ethers.utils.parseEther('2')

        await owner1.sendTransaction({
            to: multisigWallet.address,
            value: ethers.utils.parseEther('10'),
        })

        await multisigWallet.submitTransaction(
            externalWallet.address,
            etherToSendFromMultisigWallet,
            ethers.utils.toUtf8Bytes('')
        )

        await multisigWallet.connect(owner2).confirmTransaction(0)

        await expect(multisigWallet.executeTransaction(0)).to.be.revertedWith('not enough confirmations')
    })

    it('should revert when transaction is already executed', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await owner1.sendTransaction({
            to: multisigWallet.address,
            value: ethers.utils.parseEther('10'),
        })

        await multisigWallet.submitTransaction(
            externalWallet.address,
            ethers.utils.parseEther('1'),
            ethers.utils.toUtf8Bytes('')
        )

        await multisigWallet.connect(owner2).confirmTransaction(0)
        await multisigWallet.connect(owner3).confirmTransaction(0)

        await multisigWallet.executeTransaction(0)

        const balanceBefore = await ethers.provider.getBalance(multisigWallet.address)

        await expect(multisigWallet.executeTransaction(0)).to.be.revertedWith('transaction already executed')

        const balanceAfter = await ethers.provider.getBalance(multisigWallet.address)

        expect(balanceAfter).to.deep.eq(balanceBefore)
    })

    it('should revert when contract does not have enough balance', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await multisigWallet.submitTransaction(
            externalWallet.address,
            ethers.utils.parseEther('1'),
            ethers.utils.toUtf8Bytes('')
        )

        await multisigWallet.connect(owner2).confirmTransaction(0)
        await multisigWallet.connect(owner3).confirmTransaction(0)

        await expect(multisigWallet.executeTransaction(0)).to.be.revertedWith('tx failed')
    })

    it('should revert when owner tries to confirm already exectued transaction', async () => {
        const { multisigWallet } = await setup(owners, requiredNumOfConfimations)

        await owner1.sendTransaction({
            to: multisigWallet.address,
            value: ethers.utils.parseEther('10'),
        })

        await multisigWallet.submitTransaction(
            externalWallet.address,
            ethers.utils.parseEther('1'),
            ethers.utils.toUtf8Bytes('')
        )

        await multisigWallet.connect(owner2).confirmTransaction(0)
        await multisigWallet.connect(owner3).confirmTransaction(0)

        await multisigWallet.executeTransaction(0)

        await expect(multisigWallet.confirmTransaction(0)).to.be.revertedWith('transaction already executed')
    })
})
