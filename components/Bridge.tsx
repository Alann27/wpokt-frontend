import { Box, Button, Center, Container, Divider, Flex, HStack, Input, Text, VStack, useDisclosure, useToast } from "@chakra-ui/react";
import { EthIcon } from "./icons/eth";
import { PoktIcon } from "./icons/pokt";
import { useEffect, useState } from "react";
import { ProgressModal } from "./modal/ProgressModal";
import { CloseIcon, ErrorIcon, InfoIcon } from "./icons/misc";
import { useGlobalContext } from "@/context/Globals";
import { TimeInfoModal } from "./modal/TimeInfoModal";
import { useAccount, useBalance, useContractRead, useFeeData } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatPokt, parsePokt } from "@/utils/pokt";
import { CHAINLINK_ETH_USD_ADDRESS, WPOKT_ADDRESS } from "@/utils/constants";
import { CHAINLINK_AGGREGATOR_V3_INTERFACE_ABI, WRAPPED_POCKET_ABI } from "@/utils/abis";
import { createPublicClient, formatEther, formatUnits, getAddress, http, parseUnits } from "viem";
import { goerli } from "wagmi/chains";
import { ResumeWrapModal } from "./modal/ResumeWrapModal";
import { GasInfoModal } from "./modal/GasInfoModal";
import { ConnectPoktModal } from "./modal/ConnectPoktModal";


export function Bridge() {
    const [poktAmountInput, setPoktAmountInput] = useState<string>("")
    const [wPoktAmountInput, setWPoktAmountInput] = useState<string>("")
    const [estGasCost, setEstGasCost] = useState<string>("")
    const [ethPrice, setEthPrice] = useState<bigint|undefined>(undefined)
    const [insufficientPoktGas, setInsufficientPoktGas] = useState<boolean>(false)
    const [insufficientEthGas, setInsufficientEthGas] = useState<boolean>(false)
    const {
        screenWidth,
        poktAddress,
        destination,
        setDestination,
        poktBalance,
        bridgePoktToEthereum,
        poktTxOngoing,
        setEthTxHash,
        poktAmount,
        wPoktAmount,
        setPoktAmount,
        setWPoktAmount,
        burnFunc,
        burnTx,
        allPendingMints,
        currentBurn,
        currentMint,
        getPoktBalance,
        isSigningTx,
        resetProgress,
    } = useGlobalContext()

    const { address } = useAccount()
    const { openConnectModal } = useConnectModal()
    const { data: wPoktBalanceData, refetch: refetchWPoktBalance } = useBalance({
        address,
        token: WPOKT_ADDRESS,
    })
    const { data: ethBalanceData, isSuccess } = useBalance({
        address,
    })
    const { data: feeData } = useFeeData({ chainId: goerli.id })
    const { data: priceData, isSuccess: isPriceSuccess } = useContractRead({
        address: CHAINLINK_ETH_USD_ADDRESS,
        abi: CHAINLINK_AGGREGATOR_V3_INTERFACE_ABI,
        functionName: 'latestRoundData',
    })

    const { isOpen: isProgressOpen, onOpen: onProgressOpen, onClose: onProgressClose } = useDisclosure()
    const { isOpen: isTimeInfoOpen, onOpen: onTimeInfoOpen, onClose: onTimeInfoClose } = useDisclosure()
    const { isOpen: isGasInfoOpen, onOpen: onGasInfoOpen, onClose: onGasInfoClose } = useDisclosure()
    const { isOpen: isResumeMintOpen, onOpen: onResumeMintOpen, onClose: onResumeMintClose } = useDisclosure()
    const { isOpen: isConnectPoktModalOpen, onOpen: onConnectPoktModalOpen, onClose: onConnectPoktModalClose } = useDisclosure()

    const toast = useToast()

    useEffect(() => {
        console.log("Price Data:", priceData)
        if (priceData) {
            const data = priceData as bigint[]
            setEthPrice(data[1])
        }
    }, [isPriceSuccess])

    useEffect(() => {
        if (poktTxOngoing) {
            onProgressOpen()
        }
    }, [poktTxOngoing])

    useEffect(() => {
        if (address && poktAddress && destination) {
            getGasCost(destination)
        }
    },[address, poktAddress, destination])

    useEffect(() => {
        if (allPendingMints.length > 0) onResumeMintOpen()
    }, [allPendingMints])

    useEffect(() => {
        if (poktAmount || wPoktAmount) getGasCost(destination)
    }, [poktAmount, wPoktAmount, destination])

    useEffect(() => {
        if (isSuccess && ethBalanceData && estGasCost) {
            if (ethBalanceData?.value < parseUnits(estGasCost, 18)) {
                setInsufficientEthGas(true)
            } else {
                setInsufficientEthGas(false)
            }
        }
        if (BigInt(poktBalance) < poktAmount + parsePokt('0.01')) {
            setInsufficientPoktGas(true)
        } else {
            setInsufficientPoktGas(false)
        }
    }, [ethBalanceData?.value, poktBalance, estGasCost, poktAmount, wPoktAmount])

    useEffect(() => {
        if (burnTx?.isSuccess || currentMint?.status === "success" || currentBurn?.status === "confirmed" || !isProgressOpen) refetchWPoktBalance()
        if (currentBurn?.status === "success" || currentMint?.status === "confirmed" || !isProgressOpen) getPoktBalance()
    }, [burnTx?.isSuccess, currentMint?.status, currentBurn?.status, isProgressOpen])


    async function burn() {
        if (wPoktBalanceData && wPoktAmount > wPoktBalanceData?.value) {
            return displayInsufficientTokenBalanceToast()
        }
        if (burnFunc.writeAsync) {
            try {
                const tx = await burnFunc.writeAsync()
                console.log("Burn Data:", burnFunc.data)
                console.log("Burn Tx:", tx)
                setEthTxHash(tx.hash)
                onProgressOpen()
            } catch (error) {
                console.error(error)
            }
        }
    }

    async function getGasCost(dest: string): Promise<void> {
        let gas: bigint
        try {
            const pubClient = createPublicClient({
                chain: goerli,
                transport: http()
            })
            if (dest === "pokt") {
                gas = await pubClient.estimateContractGas({
                    address: getAddress(WPOKT_ADDRESS),
                    abi: WRAPPED_POCKET_ABI,
                    functionName: 'burnAndBridge',
                    args: [wPoktAmount, getAddress(`0x${poktAddress}`)],
                    account: getAddress(address ?? '')
                })
            } else {
                gas = poktAmount > BigInt(0) ? BigInt(289000) : BigInt(0) // Default estimate for minting
            }
        } catch (error) {
            console.error(error)
            gas = BigInt(0)
            if (dest === "eth" && poktAmount > BigInt(0)) gas = BigInt(289000) // Default estimate for minting
        }
        setEstGasCost(gas > BigInt(0) ? formatEther(gas * (feeData?.maxFeePerGas ?? BigInt(0))) : "")
    }

    function displayInsufficientGasToast() {
        const toastId = 'insufficient-gas'
        if (!toast.isActive(toastId)) toast({
            id: toastId,
            position: "top-right",
            duration: 5000,
            render: () => (
                <HStack mt={'140px'} spacing={4} padding={4} minW={330} bg="darkBlue" borderRadius={10} borderBottomColor="error" borderBottomWidth={1}>
                    <ErrorIcon />
                    <Text color="error">You may not have enough gas in your wallet.</Text>
                </HStack>
            )
        })
    }

    function displayInsufficientTokenBalanceToast() {
        const toastId = 'insufficient-balance'
        if (!toast.isActive(toastId)) toast({
            id: toastId,
            position: "top-right",
            duration: 5000,
            render: () => (
                <HStack mt={'140px'} spacing={4} padding={4} minW={330} bg="darkBlue" borderRadius={10} borderBottomColor="error" borderBottomWidth={1}>
                    <ErrorIcon />
                    <Text color="error">Insufficient token balance.</Text>
                </HStack>
            )
        })
    }

    return (
        <VStack minWidth={screenWidth && screenWidth < 580 ? screenWidth : '580px'}>
            <Button
                bg="poktLime"
                color="darkBlue"
                _hover={{ bg: "hover.poktLime" }}
                onClick={() => setDestination(destination === "pokt" ? "eth" : "pokt")}
            >
                {destination === "eth" ? "POKT" : "wPOKT"} &rarr; {destination === "eth" ? "wPOKT" : "POKT"}
            </Button>
            {destination === "eth" ? (
                <Container bg="darkOverlay" paddingY={4}>
                    <Center>
                        <Box width={320}>
                            <HStack justify="space-between" mb={1}>
                                <Text>Amount to wrap</Text>
                                <Text>{poktAddress ? `${formatPokt(poktBalance)} POKT in wallet` : 'No wallet connected'}</Text>
                            </HStack>
                            {poktAddress ? (
                                <Box>
                                    <PoktIcon fill="white" position="absolute" ml={280} mt="6px" width="26px" height="26px" />
                                    <Input
                                        type="number"
                                        borderRadius={0}
                                        borderColor={poktAmount + parsePokt(0.01) > poktBalance && poktAmount !== BigInt(0) ? "error" : 'none'}
                                        _focus={{ borderColor: poktAmount + parsePokt(0.01) > poktBalance && poktAmount !== BigInt(0) ? "error" : 'none' }}
                                        placeholder="Enter POKT amount"
                                        value={poktAmountInput}
                                        onChange={(e) => {
                                            const { value } = e.currentTarget
                                            setPoktAmountInput(value)
                                            setPoktAmount(parsePokt(value ?? 0))
                                        }}
                                    />
                                </Box>
                            ) : (
                                <Center>
                                    <Button
                                        variant="outline"
                                        borderColor="poktLime"
                                        bg="transparent"
                                        color="white"
                                        _hover={{ bg: "rgba(255,255,255,0.1)" }}
                                        leftIcon={<PoktIcon fill={"white"}/>}
                                        onClick={onConnectPoktModalOpen}
                                        minW={200}
                                    >
                                        Connect POKT Wallet
                                    </Button>
                                </Center>
                            )}
                        </Box>
                    </Center>
                    <Box>
                        <Center mt={6}>
                            <HStack width={320} justify="space-between" mb={1}>
                                <Text textAlign="left">Destination Wallet</Text>
                                <Text>{address ? `${wPoktBalanceData?.formatted ?? 0} wPOKT in wallet` : 'No wallet connected'}</Text>
                            </HStack>
                        </Center>
                        {address ? (
                            <Flex align="center" justify="space-between" bg="darkBlue" paddingX={4} paddingY={2}>
                                <EthIcon fill="poktBlue" width="26px" height="26px" />
                                <Text>{address}</Text>
                                <CloseIcon width="22.63px" height="22.63px" fill="none" />
                            </Flex>
                        ) : (
                            <Center>
                                <Button
                                    variant="outline"
                                    borderColor="poktLime"
                                    bg="transparent"
                                    color="white"
                                    _hover={{ bg: "rgba(255,255,255,0.1)" }}
                                    leftIcon={<EthIcon fill={"white"}/>}
                                    onClick={openConnectModal}
                                    minW={200}
                                >
                                    Connect ETH Wallet
                                </Button>
                            </Center>
                        )}
                    </Box>
                    <Center>
                        <Divider mt={6} bgColor={"poktLime"} maxW={360} />
                    </Center>
                    <Center my={6}>
                        <VStack width={320} spacing={4} align="flex-start">
                            <Box>
                                <Text>Estimated Gas Cost:</Text>
                                <Flex align="center" gap={2}>
                                    <Text>{0.01} POKT + {estGasCost ? (estGasCost.startsWith('0.0000') ? '<0.0001' : estGasCost.substring(0,7)) : '----'} ETH</Text>
                                    {(!!ethPrice && !!estGasCost) && <Text>(~${(parseFloat(estGasCost) * parseFloat(formatUnits(ethPrice, 8))).toFixed(2)})</Text>}
                                    <InfoIcon _hover={{ cursor: "pointer" }} onClick={onGasInfoOpen} />
                                    {((insufficientEthGas||insufficientPoktGas) && address && poktAddress) && <ErrorIcon _hover={{ cursor: 'pointer' }} onClick={displayInsufficientGasToast} />}
                                </Flex>
                            </Box>
                            <Box>
                                <Text>Estimated wPOKT Received:</Text>
                                <Text>{poktAmountInput.length ? poktAmountInput : '----'} wPOKT</Text>
                            </Box>
                            <Box>
                                <Text>Estimated time for bridge:</Text>
                                <Flex align="center" gap={2}>
                                    <Text>~30 Minutes</Text>
                                    <InfoIcon _hover={{ cursor: "pointer" }} onClick={onTimeInfoOpen} />
                                </Flex>
                            </Box>
                        </VStack>
                    </Center>
                    <Center>
                        <Button
                            bg="poktLime"
                            color="darkBlue"
                            _hover={{ bg: "hover.poktLime" }}
                            onClick={async () => {
                                if (poktAmount + parsePokt(0.01) > poktBalance) return displayInsufficientTokenBalanceToast()
                                const recipient = address ?? ""
                                await bridgePoktToEthereum(recipient, poktAmount)
                            }}
                            isDisabled={!poktAddress||!address||!poktAmount}
                            isLoading={isSigningTx}
                        >
                            Wrap
                        </Button>
                    </Center>
                </Container>
            ) : (
                <Container bg="darkOverlay" paddingY={4}>
                    <Center>
                        <Box width={320}>
                            <HStack justify="space-between" mb={1}>
                                <Text>Amount to unwrap</Text>
                                <Text>{address ? `${wPoktBalanceData?.formatted ?? 0} wPOKT in wallet` : 'No wallet connected'}</Text>
                            </HStack>
                            {address ? (
                                <Box>
                                    <EthIcon fill="white" position="absolute" ml={280} mt="6px" width="26px" height="26px" />
                                    <Input
                                        type="number"
                                        borderRadius={0}
                                        borderColor={wPoktBalanceData && wPoktAmount > wPoktBalanceData?.value && wPoktAmount !== BigInt(0) ? "error" : 'none'}
                                        _focus={{ borderColor: wPoktBalanceData && wPoktAmount > wPoktBalanceData?.value && wPoktAmount !== BigInt(0) ? "error" : 'none' }}
                                        placeholder="Enter wPOKT amount"
                                        value={wPoktAmountInput}
                                        onChange={(e) => {
                                            const { value } = e.currentTarget
                                            setWPoktAmountInput(value ?? '')
                                            setWPoktAmount(value ? parseUnits(value, 6) : BigInt(0))
                                        }}
                                    />
                                </Box>
                            ) : (
                                <Center>
                                    <Button
                                        variant="outline"
                                        borderColor="poktLime"
                                        bg="transparent"
                                        color="white"
                                        _hover={{ bg: "rgba(255,255,255,0.1)" }}
                                        leftIcon={<EthIcon fill={"white"}/>}
                                        onClick={openConnectModal}
                                        minW={200}
                                    >
                                        Connect ETH Wallet
                                    </Button>
                                </Center>
                            )}
                        </Box>
                    </Center>
                    <Center mt={6}>
                        <HStack width={320} mb={1} justify="space-between">
                            <Text>Destination Wallet</Text>
                            <Text>{poktAddress ? `${formatPokt(poktBalance)} POKT in wallet` : 'No wallet connected'}</Text>
                        </HStack>
                    </Center>
                    {poktAddress ? (
                        <Flex align="center" justify="space-between" bg="darkBlue" paddingX={4} paddingY={2} maxW={screenWidth}>
                            <PoktIcon fill="poktBlue" width="26px" height="26px" />
                            <Text>{screenWidth && screenWidth < 400 ? poktAddress.substring(0,6) + '...' + poktAddress.substring(poktAddress.length - 6, poktAddress.length - 1) : poktAddress}</Text>
                            <CloseIcon width="22.63px" height="22.63px" fill="none" />
                        </Flex>
                    ) : (
                        <Center>
                            <Button
                                variant="outline"
                                borderColor="poktLime"
                                bg="transparent"
                                color="white"
                                _hover={{ bg: "rgba(255,255,255,0.1)" }}
                                leftIcon={<PoktIcon fill={"white"}/>}
                                onClick={onConnectPoktModalOpen}
                                minW={200}
                            >
                                Connect POKT Wallet
                            </Button>
                        </Center>
                    )}
                    <Center>
                        <Divider mt={6} bgColor={"poktLime"} maxW={360} />
                    </Center>
                    <Center my={6}>
                        <VStack width={320} spacing={4} align="flex-start">
                            <Box>
                                <Text>Estimated Gas Cost:</Text>
                                <Flex align="center" gap={2}>
                                    <Text>{estGasCost ? (estGasCost.startsWith('0.0000') ? '<0.0001' : estGasCost.substring(0,7)) : '----'} ETH</Text>
                                    {(!!ethPrice && !!estGasCost) && <Text>(~${(parseFloat(estGasCost) * parseFloat(formatUnits(ethPrice, 8))).toFixed(2)})</Text>}
                                    {(insufficientEthGas && address) && <ErrorIcon _hover={{ cursor: 'pointer' }} onClick={displayInsufficientGasToast} />}
                                </Flex>
                            </Box>
                            <Box>
                                <Text>Estimated POKT Received:</Text>
                                <Text>{wPoktAmountInput.length ? wPoktAmountInput : '----'} POKT</Text>
                            </Box>
                            <Box>
                                <Text>Estimated time for bridge:</Text>
                                <Flex align="center" gap={2}>
                                    <Text>~30 Minutes</Text>
                                    <InfoIcon _hover={{ cursor: "pointer" }} onClick={onTimeInfoOpen} />
                                </Flex>
                            </Box>
                        </VStack>
                    </Center>
                    <Center>
                        <Button
                            bg="poktLime"
                            color="darkBlue"
                            _hover={{ bg: "hover.poktLime" }}
                            onClick={burn}
                            isDisabled={!poktAddress||!address||!wPoktAmount}
                        >
                            Unwrap
                        </Button>
                    </Center>
                </Container>
            )}
            <ResumeWrapModal
                isOpen={isResumeMintOpen}
                onClose={onResumeMintClose}
                mintInfo={allPendingMints.length > 0 ? allPendingMints[allPendingMints.length - 1] : undefined}
                openProgressModal={onProgressOpen}
            ><></></ResumeWrapModal>
            <ProgressModal isOpen={isProgressOpen} onClose={() => {
                onProgressClose()
                resetProgress()
            }}><></></ProgressModal>
            <GasInfoModal isOpen={isGasInfoOpen} onClose={onGasInfoClose}><></></GasInfoModal>
            <TimeInfoModal isOpen={isTimeInfoOpen} onClose={onTimeInfoClose}><></></TimeInfoModal>
            <ConnectPoktModal isOpen={isConnectPoktModalOpen} onClose={onConnectPoktModalClose}><></></ConnectPoktModal>
        </VStack>
    )
}