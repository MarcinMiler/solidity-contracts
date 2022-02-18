//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import 'hardhat/console.sol';

contract MultisigWallet {
    uint256 public requiredNumOfConfirmations;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numberOfConfirmations;
    }

    Transaction[] public transactions;
    address[] public owners;
    mapping(address => bool) public isOwner;
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    modifier onlyOwner() {
        require(isOwner[msg.sender], 'not owner');
        _;
    }

    modifier txExists(uint256 txId) {
        require(txId < transactions.length, 'tx does not exist');
        _;
    }

    modifier txNotExecuted(uint256 txId) {
        require(!transactions[txId].executed, 'transaction already executed');
        _;
    }

    modifier txNotConfirmed(uint256 txId) {
        require(!isConfirmed[txId][msg.sender], 'transaction already confirmed');
        _;
    }

    event Deposit(address indexed sender, uint256 value);
    event SubmitTransaction(address indexed owner, uint256 indexed txId, address indexed to, uint256 value, bytes data);
    event ConfirmTransaction(address indexed owner, uint256 indexed txId);
    event RevokeConfirmation(address indexed owner, uint256 indexed txId);
    event ExecuteTransaction(address indexed owner, uint256 indexed txId);

    constructor(address[] memory _owners, uint256 _requiredNumOfConfirmations) {
        require(_owners.length > 0, 'owners required');
        require(
            _requiredNumOfConfirmations > 0 && _requiredNumOfConfirmations <= _owners.length,
            'invalid number of confirmations'
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), 'invalid owner address');
            require(!isOwner[owner], 'duplicated owner');

            isOwner[owner] = true;
            owners.push(owner);
        }

        requiredNumOfConfirmations = _requiredNumOfConfirmations;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes calldata _data
    ) public onlyOwner {
        uint256 txId = transactions.length;

        transactions.push(
            Transaction({to: _to, value: _value, data: _data, executed: false, numberOfConfirmations: 0})
        );

        emit SubmitTransaction(msg.sender, txId, _to, _value, _data);
    }

    function confirmTransaction(uint256 txId) public onlyOwner txExists(txId) txNotConfirmed(txId) txNotExecuted(txId) {
        Transaction storage transaction = transactions[txId];
        transaction.numberOfConfirmations += 1;
        isConfirmed[txId][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, txId);
    }

    function revokeConfirmation(uint256 txId) public onlyOwner txExists(txId) txNotExecuted(txId) {
        Transaction storage transaction = transactions[txId];

        require(isConfirmed[txId][msg.sender], 'transaction not confirmed');

        transaction.numberOfConfirmations -= 1;
        isConfirmed[txId][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, txId);
    }

    function executeTransaction(uint256 txId) public onlyOwner txExists(txId) txNotExecuted(txId) {
        Transaction storage transaction = transactions[txId];

        require(transaction.numberOfConfirmations >= requiredNumOfConfirmations, 'not enough confirmations');

        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, 'tx failed');

        transaction.executed = true;

        emit ExecuteTransaction(msg.sender, txId);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransaction(uint256 txId)
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numberOfConfirmations
        )
    {
        Transaction memory transaction = transactions[txId];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numberOfConfirmations
        );
    }
}
