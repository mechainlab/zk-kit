import { expect } from "chai"
import { Contract } from "ethers"
import { ethers, run } from "hardhat"
import { poseidon } from "circomlibjs"
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree"
import { createTree } from "./utils"

/* eslint-disable jest/valid-expect */
describe("IncrementalBinaryTreeTest", () => {
    let contract: Contract

    const treeId = ethers.utils.formatBytes32String("treeId")
    const treeIdDefaultZeroes = ethers.utils.formatBytes32String("treeDefaultZeroes")
    const leaf = BigInt(1)
    const depth = 16

    before(async () => {
        contract = await run("deploy:ibt-test", { logs: false })
    })

    it("Should not create a tree with a depth > 32", async () => {
        const transaction = contract.createTree(treeId, 33)

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: tree depth must be between 1 and 32")
    })

    it("Should create a tree", async () => {
        const transaction = contract.createTree(treeId, depth)

        await expect(transaction).to.emit(contract, "TreeCreated").withArgs(treeId, depth)
    })

    it("Should create a tree with default zeroes", async () => {
        const transaction = contract.createTreeDefaultZeroes(treeIdDefaultZeroes, depth)

        await expect(transaction).to.emit(contract, "TreeCreated").withArgs(treeIdDefaultZeroes, depth)
    })

    it("Should not create a tree with an existing id", async () => {
        const transaction = contract.createTree(treeId, depth)

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTreeTest: tree already exists")
    })

    it("Should not insert a leaf if the tree does not exist", async () => {
        const treeId = ethers.utils.formatBytes32String("treeId2")

        const transaction = contract.insertLeaf(treeId, leaf)

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTreeTest: tree does not exist")
    })

    it("Should not insert a leaf if its value is > SNARK_SCALAR_FIELD", async () => {
        const leaf = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495618")

        const transaction = contract.insertLeaf(treeId, leaf)

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf must be < SNARK_SCALAR_FIELD")
    })

    it("Should insert a leaf in a tree", async () => {
        const tree = createTree(depth, 1)
        const transaction = contract.insertLeaf(treeId, leaf)

        await expect(transaction).to.emit(contract, "LeafInserted").withArgs(treeId, leaf, tree.root)
    })

    it("Should insert a leaf in a default zeroes tree", async () => {
        const tree = new IncrementalMerkleTree(poseidon, depth, 0)
        tree.insert(leaf)
        const transaction = contract.insertLeaf(treeIdDefaultZeroes, leaf)

        await expect(transaction).to.emit(contract, "LeafInserted").withArgs(treeIdDefaultZeroes, leaf, tree.root)
    })

    it("Should insert 4 leaves in a tree", async () => {
        const treeId = ethers.utils.formatBytes32String("tree2")
        await contract.createTree(treeId, depth)
        const tree = createTree(depth, 0)

        for (let i = 0; i < 4; i += 1) {
            tree.insert(BigInt(i + 1))
            const transaction = contract.insertLeaf(treeId, BigInt(i + 1))

            await expect(transaction)
                .to.emit(contract, "LeafInserted")
                .withArgs(treeId, BigInt(i + 1), tree.root)
        }
    })

    it("Should insert 4 leaves in a default zeroes tree", async () => {
        const _treeId = ethers.utils.formatBytes32String("tree2DefaultZeroes")
        const _depth = 32
        await contract.createTreeDefaultZeroes(_treeId, _depth)
        const tree = new IncrementalMerkleTree(poseidon, _depth, 0)
        for (let x = 0; x < 4; x += 1) {
            const _leaf = BigInt((x + 10) ** 2)
            tree.insert(_leaf)
            const transaction = contract.insertLeaf(_treeId, _leaf)

            await expect(transaction).to.emit(contract, "LeafInserted").withArgs(_treeId, _leaf, tree.root)
        }
    })

    it("Should not insert a leaf if the tree is full", async () => {
        const treeId = ethers.utils.formatBytes32String("tinyTree")

        await contract.createTree(treeId, 1)
        await contract.insertLeaf(treeId, leaf)
        await contract.insertLeaf(treeId, leaf)

        const transaction = contract.insertLeaf(treeId, leaf)

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: tree is full")
    })

    it("Should not update a leaf if the tree does not exist", async () => {
        const treeId = ethers.utils.formatBytes32String("none")

        const transaction = contract.updateLeaf(treeId, leaf, leaf, [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTreeTest: tree does not exist")
    })

    it("Should not update a leaf if the new value is the same as the old one", async () => {
        const leaf = BigInt(3)

        const transaction = contract.updateLeaf(treeId, leaf, leaf, [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith(
            "IncrementalBinaryTree: new leaf cannot be the same as the old one"
        )
    })

    it("Should not update a leaf if its new value is > SNARK_SCALAR_FIELD", async () => {
        const leaf = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495618")

        const transaction = contract.updateLeaf(treeId, BigInt(3), leaf, [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: new leaf must be < SNARK_SCALAR_FIELD")
    })

    it("Should not update a leaf if its original value is > SNARK_SCALAR_FIELD", async () => {
        const leaf = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495618")

        const transaction = contract.updateLeaf(treeId, leaf, BigInt(4), [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf must be < SNARK_SCALAR_FIELD")
    })

    it("Should not update a leaf if the path indices are wrong", async () => {
        const treeId = ethers.utils.formatBytes32String("tree2")
        const tree = createTree(depth, 0)

        for (let i = 0; i < 4; i += 1) {
            tree.insert(BigInt(i + 1))
        }

        const leaf = BigInt(1337)

        tree.update(2, leaf)

        const { pathIndices, siblings } = tree.createProof(2)

        pathIndices[0] = 2

        const transaction = contract.updateLeaf(
            treeId,
            BigInt(4),
            leaf,
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: path index is neither 0 nor 1")
    })

    it("Should not update a leaf if the wrong current leaf is given", async () => {
        const treeId = ethers.utils.formatBytes32String("tree2")
        const tree = createTree(depth, 0)

        for (let i = 0; i < 4; i += 1) {
            tree.insert(BigInt(i + 1))
        }

        const leaf = BigInt(1337)

        tree.update(2, leaf)

        const { pathIndices, siblings } = tree.createProof(2)
        const transaction = contract.updateLeaf(
            treeId,
            BigInt(4),
            leaf,
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf is not part of the tree")
    })

    it("Should update a leaf", async () => {
        const treeId = ethers.utils.formatBytes32String("tree2")
        const tree = createTree(depth, 0)

        for (let i = 0; i < 4; i += 1) {
            tree.insert(BigInt(i + 1))
        }

        const leaf = BigInt(1337)

        tree.update(2, leaf)

        const { root, pathIndices, siblings } = tree.createProof(2)
        const transaction = contract.updateLeaf(
            treeId,
            BigInt(3),
            leaf,
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.emit(contract, "LeafUpdated").withArgs(treeId, leaf, root)
    })

    it("Should not remove a leaf if the tree does not exist", async () => {
        const treeId = ethers.utils.formatBytes32String("none")

        const transaction = contract.removeLeaf(treeId, leaf, [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTreeTest: tree does not exist")
    })

    it("Should not remove a leaf if its value is > SNARK_SCALAR_FIELD", async () => {
        const leaf = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495618")

        const transaction = contract.removeLeaf(treeId, leaf, [0, 1], [0, 1])

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf must be < SNARK_SCALAR_FIELD")
    })

    it("Should remove a leaf", async () => {
        const treeId = ethers.utils.formatBytes32String("hello")
        const tree = createTree(depth, 3)

        tree.delete(0)

        await contract.createTree(treeId, depth)
        await contract.insertLeaf(treeId, BigInt(1))
        await contract.insertLeaf(treeId, BigInt(2))
        await contract.insertLeaf(treeId, BigInt(3))

        const { siblings, pathIndices, root } = tree.createProof(0)
        const transaction = contract.removeLeaf(
            treeId,
            BigInt(1),
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.emit(contract, "LeafRemoved").withArgs(treeId, BigInt(1), root)
    })

    it("Should remove a leaf in default zeroes tree", async () => {
        const _treeId = ethers.utils.formatBytes32String("defaultZeroesRemoveTree")
        const tree = new IncrementalMerkleTree(poseidon, depth, 0)
        await contract.createTreeDefaultZeroes(_treeId, depth)
        for (let x = 1; x < 4; x += 1) {
            tree.insert(x)
            await contract.insertLeaf(_treeId, x)
        }

        tree.delete(0)

        const { siblings, pathIndices, root } = tree.createProof(0)
        const transaction = contract.removeLeaf(
            _treeId,
            BigInt(1),
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.emit(contract, "LeafRemoved").withArgs(_treeId, BigInt(1), root)
    })

    it("Should not update a leaf that hasn't been inserted yet", async () => {
        // deploy a new, empty tree
        const treeId = ethers.utils.formatBytes32String("brokenTree")
        contract.createTree(treeId, depth)
        const tree = createTree(depth, 0)

        // insert 4 leaves into the tree
        for (let i = 0; i < 4; i += 1) {
            tree.insert(BigInt(i + 1))
            await contract.insertLeaf(treeId, BigInt(i + 1))
        }

        // we're going to try to update leaf 7, despite there only being 4 leaves in the tree
        const leaf = BigInt(42069)

        // note that we can insert zeros into the js library tree and the root won't change!
        // that's because we use the zeros optimization to calculate the roots efficiently.
        // technically speaking, there isn't an "empty" tree, there is only a tree that is
        // entirely full of the zero value at every index. therefore inserting the zero value
        // at any point into an incremental merkle tree doesn't change it's root, because
        // that is already the data the root was calculated from previously. in principle,
        // we can update any leaf that hasn't been inserted yet using this method
        const rootBeforeZeros = tree.root
        tree.insert(0)
        tree.insert(0)
        tree.insert(0)
        // the root doesn't change because the tree started full with 0s!
        expect(tree.root).to.be.equal(rootBeforeZeros)

        // now we can make a merkle proof of zero being included at the uninitialized index
        const { pathIndices, siblings } = tree.createProof(6)

        const transaction = contract.updateLeaf(
            treeId,
            BigInt(0),
            leaf,
            siblings.map((s) => s[0]),
            pathIndices
        )
        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf index out of range")
    })

    it("Should remove another leaf", async () => {
        const treeId = ethers.utils.formatBytes32String("hello")
        const tree = createTree(depth, 3)

        tree.delete(0)
        tree.delete(1)

        const { siblings, pathIndices, root } = tree.createProof(1)

        const transaction = contract.removeLeaf(
            treeId,
            BigInt(2),
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.emit(contract, "LeafRemoved").withArgs(treeId, BigInt(2), root)
    })

    it("Should not remove a leaf that does not exist", async () => {
        const treeId = ethers.utils.formatBytes32String("hello")
        const tree = createTree(depth, 3)

        tree.delete(0)
        tree.delete(1)

        const { siblings, pathIndices } = tree.createProof(0)

        const transaction = contract.removeLeaf(
            treeId,
            BigInt(4),
            siblings.map((s) => s[0]),
            pathIndices
        )

        await expect(transaction).to.be.revertedWith("IncrementalBinaryTree: leaf is not part of the tree")
    })

    it("Should insert a leaf in a tree after a removal", async () => {
        const treeId = ethers.utils.formatBytes32String("hello")
        const tree = createTree(depth, 4)

        tree.delete(0)
        tree.delete(1)

        const transaction = contract.insertLeaf(treeId, BigInt(4))

        await expect(transaction).to.emit(contract, "LeafInserted").withArgs(treeId, BigInt(4), tree.root)
    })

    it("Should insert 4 leaves and remove them all", async () => {
        const treeId = ethers.utils.formatBytes32String("complex")
        const tree = createTree(depth, 4)

        await contract.createTree(treeId, depth)

        for (let i = 0; i < 4; i += 1) {
            await contract.insertLeaf(treeId, BigInt(i + 1))
        }

        for (let i = 0; i < 4; i += 1) {
            tree.delete(i)

            const { siblings, pathIndices } = tree.createProof(i)

            await contract.removeLeaf(
                treeId,
                BigInt(i + 1),
                siblings.map((s) => s[0]),
                pathIndices
            )
        }

        const { root } = await contract.trees(treeId)

        expect(root).to.equal(tree.root)
    })
})
