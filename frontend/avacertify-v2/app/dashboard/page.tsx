"use client";

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Copy, ExternalLink, Loader2, Search, RefreshCw, AlertCircle } from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Certificate, certificateService } from "@/utils/blockchain";
import { AVALANCHE_FUJI_CONFIG } from "@/utils/contractConfig";
import { motion } from 'framer-motion';
// import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Dashboard component for viewing issued certificates.
 * Fetches certificates by querying blockchain events.
 */
export default function Dashboard() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [filteredCertificates, setFilteredCertificates] = useState<Certificate[]>([]);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConnected, _setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [connectedAddress, _setConnectedAddress] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<"standard" | "nft" | "all">("all");
  const [showMyOnly, setShowMyOnly] = useState(false);
  const { toast } = useToast();

  /**
   * Checks if the connected blockchain network matches the required Avalanche Fuji Testnet.
   */
  const checkNetwork = useCallback(async () => {
    const network = await certificateService.getNetwork();
    if (!network || network.chainId !== BigInt(parseInt(AVALANCHE_FUJI_CONFIG.chainId, 16))) {
      throw new Error("Please connect to Avalanche Fuji Testnet");
    }
  }, []);

  /**
   * Fetches certificates by querying CertificateIssued events from the blockchain.
   * Implements pagination to handle RPC provider block limits (2048 blocks per query).
   */
  const fetchCertificatesFromBlockchain = useCallback(async () => {
    setIsLoading(true);
    try {
      // Initialize blockchain service
      await certificateService.init();
      
      // Note: do not attempt to force wallet connection here.
      // Initialize provider/network check independently of user wallet connection.
      try {
        await checkNetwork();
      } catch (networkErr) {
        // If network check fails because no wallet is connected, we still want to
        // continue reading from the provider (public RPC) so do not abort here.
        console.warn("Network check failed (proceeding with provider):", networkErr);
      }

      // Get read-only contract instances (no wallet required)
      const contract = await certificateService.getReadOnlyContract();
      const nftContract = await certificateService.getReadOnlyNFTContract();
      const provider = await certificateService.getProvider();
      
      if (!provider) {
        throw new Error("Provider not available");
      }

      const allCertificates: Certificate[] = [];
      const BLOCK_RANGE = 2000; // Stay under 2048 limit
      const MAX_BLOCKS_TO_SCAN = 1000000000; // Scan up to 1000 million blocks back

      const currentBlock = await provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - MAX_BLOCKS_TO_SCAN);

      console.log(`Scanning from block ${startBlock} to ${currentBlock}`);
      setLoadingProgress(`Scanning blocks ${startBlock} to ${currentBlock}...`);

      // Query CertificateIssued events for standard certificates in chunks
      try {
        const filter = contract.filters.CertificateIssued();
        let scannedBlocks = 0;
        const totalBlocks = currentBlock - startBlock;
        
        for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += BLOCK_RANGE) {
          const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);
          scannedBlocks += (toBlock - fromBlock + 1);
          
          setLoadingProgress(`Scanning certificates: ${Math.round((scannedBlocks / totalBlocks) * 100)}%`);
          
          try {
            const events = await contract.queryFilter(filter, fromBlock, toBlock);
            console.log(`Found ${events.length} CertificateIssued events in blocks ${fromBlock}-${toBlock}`);

            // Fetch details for each certificate
          for (const event of events) {
            // Narrow to EventLog (which has `args`) and skip plain Log entries
            if (!("args" in event)) continue;

            try {
              const certificateId = event.args?.id?.toString();
              if (!certificateId) continue;

                const cert = await certificateService.getCertificateReadOnly(certificateId, false);
                if (cert && cert.recipientAddress !== "0x0000000000000000000000000000000000000000") {
                  allCertificates.push({
                    ...cert,
                    transactionHash: event.transactionHash,
                  });
                }
              } catch (error) {
                console.error(`Failed to fetch certificate ${event.args?.id}:`, error);
              }
            }
          } catch (error) {
            console.error(`Error querying blocks ${fromBlock}-${toBlock}:`, error);
          }
        }
      } catch (error) {
        console.error("Failed to query standard certificate events:", error);
      }

      // Query CertificateMinted events for NFT certificates in chunks
      try {
        const nftFilter = nftContract.filters.CertificateMinted();
        let scannedBlocks = 0;
        const totalBlocks = currentBlock - startBlock;
        
        for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += BLOCK_RANGE) {
          const toBlock = Math.min(fromBlock + BLOCK_RANGE - 1, currentBlock);
          scannedBlocks += (toBlock - fromBlock + 1);
          
          setLoadingProgress(`Scanning NFTs: ${Math.round((scannedBlocks / totalBlocks) * 100)}%`);
          
          try {
            const nftEvents = await nftContract.queryFilter(nftFilter, fromBlock, toBlock);
            console.log(`Found ${nftEvents.length} NFT events in blocks ${fromBlock}-${toBlock}`);

            for (const event of nftEvents) {
              // Narrow to EventLog (which has `args`) and skip plain Log entries
              if (!("args" in event)) continue;

              try {
                const tokenId = event.args?.tokenId?.toString();
                if (!tokenId) continue;

                const cert = await certificateService.getCertificateReadOnly(tokenId, true);
                if (cert) {
                  allCertificates.push({
                    ...cert,
                    isNFT: true,
                    transactionHash: event.transactionHash,
                  });
                }
              } catch (error) {
                console.error(`Failed to fetch NFT certificate ${event.args?.tokenId}:`, error);
              }
            }
          } catch (error) {
            console.error(`Error querying NFT blocks ${fromBlock}-${toBlock}:`, error);
          }
        }
      } catch (error) {
        console.error("Failed to query NFT certificate events:", error);
      }

  // Remove duplicates
      const uniqueCertificates = Array.from(
        new Map(allCertificates.map(cert => [cert.id, cert])).values()
      );

      // Sort by issue date (newest first)
      uniqueCertificates.sort((a, b) => {
        const dateA = new Date(a.issueDate).getTime();
        const dateB = new Date(b.issueDate).getTime();
        return dateB - dateA;
      });

      setCertificates(uniqueCertificates);

  // Save all certificates; the UI filter effect will derive the visible set
  setFilteredCertificates(uniqueCertificates);

      if (uniqueCertificates.length === 0) {
        toast({
          title: "No Certificates Found",
          description: "No certificates have been issued yet on this contract.",
        });
      } else {
        toast({
          title: "Certificates Loaded",
          description: `Successfully loaded ${uniqueCertificates.length} certificate(s) from blockchain`,
        });
      }
    } catch (error: unknown) {
      console.error("Failed to fetch certificates:", error);
      toast({
        title: "Error Loading Certificates",
        description: error instanceof Error ? error.message : "Failed to fetch certificates from blockchain",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingProgress("");
    }
  }, [toast, checkNetwork]);

  /**
   * Filters certificates based on search query
   */
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    //](VALID_DIRECTORY) Start from all certificates
    let base: Certificate[] = certificates;

    //](VALID_DIRECTORY) Apply contract type filter first
    if (selectedContract === "nft") {
      base = base.filter((c: Certificate) => c.isNFT);
    } else if (selectedContract === "standard") {
      base = base.filter((c: Certificate) => !c.isNFT);
    }

    //](VALID_DIRECTORY) If user requested only their certificates, further narrow by connectedAddress
    if (showMyOnly && connectedAddress) {
      const addr = connectedAddress.toLowerCase();
      base = base.filter((cert: Certificate) =>
        cert.recipientAddress?.toLowerCase() === addr ||
        cert.owner?.toLowerCase() === addr
      );
    }

    if (!query) {
      setFilteredCertificates(base);
      return;
    }

    const filtered = base.filter((cert: Certificate) =>
      cert.recipientName?.toLowerCase().includes(query) ||
      cert.certificateType?.toLowerCase().includes(query) ||
      cert.institutionName?.toLowerCase().includes(query) ||
      cert.id?.toLowerCase().includes(query) ||
      cert.recipientAddress?.toLowerCase().includes(query)
    );

    setFilteredCertificates(filtered);
  }, [searchQuery, certificates, selectedContract, showMyOnly, connectedAddress]);

  /**
   * Initialize and fetch certificates on mount
   */
  useEffect(() => {
    fetchCertificatesFromBlockchain();
  }, [fetchCertificatesFromBlockchain]);

  /**
   * Manual refresh handler
   */
  const handleRefresh = async () => {
    await fetchCertificatesFromBlockchain();
  };

  /**
   * Copies text to clipboard with user feedback
   */
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  /**
   * Formats a blockchain address for display
   */
  const formatAddress = (address: string) => {
    if (!address) return "N/A";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * Opens block explorer for transaction hash
   */
  const openBlockExplorer = (txHash: string) => {
    const explorerUrl = `https://testnet.snowtrace.io/tx/${txHash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Layout>
      <div className="container py-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Certificate Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              View all certificates issued through the platform
            </p>
            {connectedAddress && (
              <p className="text-xs text-muted-foreground mt-1">
                Connected: {formatAddress(connectedAddress)}
              </p>
            )}
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={isLoading}
            variant="outline"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>

        {isLoading && (
          <Card className="mb-6 border-dashed">
            <CardContent className="flex items-center gap-3 py-3">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Querying blockchain events... This may take a moment.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Issued Certificates ({filteredCertificates.length})</span>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search certificates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="w-48">
                  <Select value={selectedContract} onValueChange={(val) => setSelectedContract(val as "standard" | "nft" | "all")}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Contracts</SelectItem>
                      <SelectItem value="standard">Standard Certificates</SelectItem>
                      <SelectItem value="nft">NFT Certificates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isConnected && (
                  <Button onClick={() => setShowMyOnly(prev => !prev)} variant={showMyOnly ? "secondary" : "ghost"}>
                    {showMyOnly ? "Showing: My Certificates" : "My Certificates Only"}
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Loading certificates from blockchain...</p>
                {loadingProgress && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {loadingProgress}
                  </p>
                )}
              </div>
            ) : filteredCertificates.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-2">
                  {searchQuery ? "No certificates found matching your search" : "No certificates issued yet"}
                </p>
                {!searchQuery && (
                  <p className="text-sm text-muted-foreground">
                    Certificates will appear here after they are issued
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCertificates.map((cert, index) => (
                  <motion.div
                    key={cert.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => {
                        setSelectedCertificate(cert);
                        setIsDialogOpen(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {cert.certificateType || "Certificate"}
                              </h3>
                              {cert.isNFT ? (
                                <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                                  NFT
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Standard</span>
                              )}
                              <span className={`text-xs px-2 py-1 rounded ${
                                cert.status === "active" 
                                  ? "bg-green-100 text-green-700" 
                                  : "bg-red-100 text-red-700"
                              }`}>
                                {cert.status || "active"}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p>
                                <span className="font-medium">Recipient:</span> {cert.recipientName || "N/A"}
                              </p>
                              <p>
                                <span className="font-medium">Address:</span> {formatAddress(cert.recipientAddress)}
                              </p>
                              {cert.institutionName && (
                                <p>
                                  <span className="font-medium">Institution:</span> {cert.institutionName}
                                </p>
                              )}
                              {cert.issueDate && (
                                <p>
                                  <span className="font-medium">Issue Date:</span>{" "}
                                  {new Date(cert.issueDate).toLocaleDateString()}
                                </p>
                              )}
                              <p>
                                <span className="font-medium">ID:</span> {cert.id}
                              </p>
                            </div>
                          </div>
                          <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Certificate Details</DialogTitle>
              <DialogDescription>
                Complete information about the selected certificate
              </DialogDescription>
            </DialogHeader>
            {selectedCertificate && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Certificate ID {selectedCertificate.isNFT && "(Token ID)"}
                    </Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-sm font-mono truncate">{selectedCertificate.id}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(selectedCertificate.id, "Certificate ID")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <p className="text-sm font-medium mt-1 capitalize">
                      {selectedCertificate.status || "active"}
                      {selectedCertificate.isNFT && " (NFT)"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Recipient Name</Label>
                  <p className="text-sm font-medium mt-1">{selectedCertificate.recipientName || "N/A"}</p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Recipient Address</Label>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-sm font-mono truncate">{selectedCertificate.recipientAddress}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(selectedCertificate.recipientAddress, "Recipient Address")
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Certificate Type</Label>
                    <p className="text-sm font-medium mt-1">{selectedCertificate.certificateType || "Certificate"}</p>
                  </div>

                  {selectedCertificate.institutionName && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Institution Name</Label>
                      <p className="text-sm font-medium mt-1">{selectedCertificate.institutionName}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedCertificate.issueDate && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Issue Date</Label>
                      <p className="text-sm font-medium mt-1">
                        {new Date(selectedCertificate.issueDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}

                  {selectedCertificate.expirationDate && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Expiration Date</Label>
                      <p className="text-sm font-medium mt-1">
                        {new Date(selectedCertificate.expirationDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {selectedCertificate.additionalDetails && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Additional Details</Label>
                    <p className="text-sm mt-1">{selectedCertificate.additionalDetails}</p>
                  </div>
                )}

                {selectedCertificate.documentUrl && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Document</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <a
                        href={selectedCertificate.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center"
                      >
                        View Document on IPFS
                        <ExternalLink className="h-4 w-4 ml-1" />
                      </a>
                    </div>
                  </div>
                )}

                {selectedCertificate.transactionHash && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Transaction Hash</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-sm font-mono truncate">{selectedCertificate.transactionHash}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(selectedCertificate.transactionHash!, "Transaction Hash")
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openBlockExplorer(selectedCertificate.transactionHash!)}
                        title="View on Snowtrace"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}