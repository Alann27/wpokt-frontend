import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { ChakraProvider } from '@chakra-ui/react'
import { theme } from "../theme"
import { WagmiConfig, createConfig, configureChains } from 'wagmi'
import { jsonRpcProvider } from 'wagmi/providers/jsonRpc'
import { RainbowKitProvider, getDefaultWallets, darkTheme } from '@rainbow-me/rainbowkit'
import React from 'react';
import { GlobalContextProvider } from '@/context/Globals';
import { TransportProvider } from '@/context/Transport';
import { CHAIN, ETH_RPC_CONFIG, WALLET_CONNECT_PROJECT_ID } from '@/utils/constants';
 
const { chains, publicClient, webSocketPublicClient } = configureChains(
  [CHAIN],
  [jsonRpcProvider(ETH_RPC_CONFIG)],
)

const { connectors } = getDefaultWallets({
  appName: 'wPOKT Bridge',
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains
})
 
const config = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient
})

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>wPOKT Bridge</title>
        <meta name="description" content="Bridge POKT between the Pocket and Ethereum networks" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icons/pokt_blue.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope&display=swap" rel="stylesheet"></link>
      </Head>
      <WagmiConfig config={config}>
        <RainbowKitProvider chains={chains} theme={darkTheme({
          accentColor: 'rgba(185, 240, 0, 1)',
          fontStack: 'system',
          overlayBlur: 'small',
          borderRadius: 'small'
        })}>
          <ChakraProvider theme={theme}>
            <GlobalContextProvider>
              <TransportProvider>
                {React.createElement(Component, pageProps)}
              </TransportProvider>
            </GlobalContextProvider>
          </ChakraProvider>
        </RainbowKitProvider>
      </WagmiConfig>
    </>
  )
}
