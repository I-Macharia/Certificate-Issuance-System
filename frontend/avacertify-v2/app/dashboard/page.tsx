"use client";

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Copy, ExternalLink, Loader2, Upload, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Certificate, certificateService } from "@/utils/blockchain";
import { IPFSService, IPFSServiceInterface } from "@/utils/ipfsService";
import { AVALANCHE_FUJI_CONFIG } from "@/utils/contractConfig";
import { ethers } from "ethers";
import { motion } from 'framer-motion'


/**
 * Dashboard component for certificate issuance and management.
 * Provides UI and logic for issuing new certificates, viewing issued certificates, and managing organization registration.
 *
 * Handles user interactions for certificate creation, file uploads to IPFS, and displays certificate details.
 * Manages blockchain connectivity, organization registration, and certificate state.
 */
export default function Dashboard() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isNFT, setIsNFT] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [uploadState, setUploadState] = useState({
    isUploading: false,
    documentHash: "",
    metadataHash: "",
    documentUrl: "",
  });
  const [formData, setFormData] = useState({
    recipientName: "",
    recipientAddress: "",
    certificateType: "",
    issueDate: "",
    expirationDate: "",
    additionalDetails: "",
    institutionName: "",
    logoUrl: "",
    brandColor: "#FFFFFF",
  });
  const { toast } = useToast();
  const _ipfsService: IPFSServiceInterface = new IPFSService();

  /**
   * Checks if the connected blockchain network matches the required Avalanche Fuji Testnet.
   * Ensures that certificate operations are performed on the correct network.
   *
   * Throws an error if the user is not connected to the Avalanche Fuji Testnet.
   */
  const checkNetwork = useCallback(async () => {
    const network = await certificateService.getNetwork();
    if (!network || network.chainId !== BigInt(parseInt(AVALANCHE_FUJI_CONFIG.chainId, 16))) {
      throw new Error("Please connect to Avalanche Fuji Testnet");
    }
  }, []);

  /**
   * Fetches issued certificates from local storage and updates them with blockchain data.
   * Synchronizes certificate state between local storage and the blockchain.
   *
   * Displays an error toast if fetching certificates fails.
   */
  const fetchCertificates = useCallback(async () => {
    try {
      await checkNetwork();
      const storedCertificates = JSON.parse(localStorage.getItem("certificates") || "[]") as Certificate[];
      const blockchainCertificates: Certificate[] = [];
      for (const cert of storedCertificates) {
        const blockchainCert = await certificateService.getCertificate(cert.id, cert.isNFT || false);
        if (blockchainCert) {
          blockchainCertificates.push({ ...blockchainCert, transactionHash: cert.transactionHash });
        }
      }
      setCertificates(blockchainCertificates);
      localStorage.setItem("certificates", JSON.stringify(blockchainCertificates));
    } catch (error: unknown) {
      console.error("Failed to fetch certificates:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch certificates",
        variant: "destructive",
      });
    }
  }, [toast, checkNetwork]);

  useEffect(() => {
    const initBlockchain = async () => {
      try {
        await certificateService.init();
        const address = await certificateService.getConnectedAddress();
        if (address) {
          setIsConnected(true);
          await checkNetwork();
          const registered = await certificateService.isOrganizationRegistered();
          setIsRegistered(registered);
          toast({
            title: "Connected",
            description: `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`,
          });
          fetchCertificates();
        }
      } catch (error: unknown) {
        setIsConnected(false);
        toast({
          title: "Connection Error",
          description: error instanceof Error ? error.message : "Failed to connect wallet",
          variant: "destructive",
        });
      }
    };
    initBlockchain();
  }, [toast, fetchCertificates, checkNetwork]);

  /**
   * Handles uploading a certificate document to IPFS and updates upload state.
   * Validates file type and size before uploading, and provides user feedback via toasts.
   *
   * Updates the document and metadata hashes in the component state after successful upload.
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF or image file (JPG, PNG)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadState((prev) => ({ ...prev, isUploading: true }));

    try {
      // Check if Pinata credentials are configured
      if (!process.env.NEXT_PUBLIC_PINATA_JWT || !process.env.NEXT_PUBLIC_PINATA_GATEWAY) {
        throw new Error("IPFS upload not configured. Please add Pinata credentials to continue.");
      }
      
  // Instantiate IPFS service with explicit interface type
  const ipfsService: IPFSServiceInterface = new IPFSService();
      
      const documentHash = await ipfsService.uploadFile(file);
      const documentUrl = ipfsService.getGatewayUrl(documentHash);
      const metadata = ipfsService.generateMetadata(
        formData.certificateType || "Certificate",
        "Certificate issued by AvaCertify",
        documentHash,
        formData.brandColor,
        formData.institutionName
      );
      const metadataHash = await ipfsService.uploadJSON(metadata);

      setUploadState((prev) => ({
        ...prev,
        isUploading: false,
        documentHash,
        metadataHash,
        documentUrl,
      }));

      toast({
        title: "File Uploaded",
        description: "Document and metadata successfully uploaded to IPFS",
      });
    } catch (error: unknown) {
      setUploadState((prev) => ({ ...prev, isUploading: false }));
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file to IPFS",
        variant: "destructive",
      });
      // Clear the file input
      const fileInput = event.target;
      if (fileInput) fileInput.value = "";
    }
  };

  /**
   * Updates the form data state for certificate issuance.
   * Allows controlled input fields to update their corresponding values.
   *
   * Args:
   *   field: The name of the form field to update.
   *   value: The new value for the specified field.
   */
  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Registers the organization for NFT certificate issuance.
   * Validates required fields and provides user feedback on registration status.
   *
   * Displays a toast notification for success or failure.
   */
  const handleRegisterOrganization = async () => {
    if (!formData.logoUrl || !formData.brandColor) {
      toast({
        title: "Missing Information",
        description: "Please provide logo URL and brand color",
        variant: "destructive",
      });
      return;
    }

    try {
      await certificateService.registerOrganization(formData.logoUrl, formData.brandColor);
      setIsRegistered(true);
      toast({
        title: "Organization Registered",
        description: "Successfully registered organization for NFT certificates",
      });
    } catch (error: unknown) {
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Failed to register organization",
        variant: "destructive",
      });
    }
  };

  /**
   * Copies the specified text to the clipboard and shows a confirmation toast.
   * Used for copying certificate details such as IDs and addresses.
   *
   * Args:
   *   text: The text to copy to the clipboard.
   *   label: A label describing the copied content for user feedback.
   */
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  /**
   * Handles the issuance of a new certificate or NFT certificate.
   * Validates form data, interacts with blockchain and IPFS, and updates certificate state.
   *
   * Args:
   *   event: The form submission event.
   */
  const handleIssueCertificate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      await checkNetwork();
      const { recipientName, recipientAddress, certificateType, issueDate, expirationDate, additionalDetails, institutionName } = formData;

      if (!recipientName || !recipientAddress || !certificateType || !issueDate || !institutionName) {
        throw new Error("Missing required fields");
      }

      if (!ethers.isAddress(recipientAddress)) {
        throw new Error("Invalid recipient address");
      }

      if (recipientName.length > 100) {
        throw new Error("Recipient name too long (max 100 characters)");
      }

      if (isNFT && !isRegistered) {
        throw new Error("Organization not registered. Please register first.");
      }

      if (!isNFT) {
        const hasRole = await certificateService.hasIssuerRole();
        if (!hasRole) {
          throw new Error("Wallet does not have ISSUER_ROLE. Contact admin to grant role.");
        }
      }

      setIsIssuing(true);
      toast({
        title: "Transaction Pending",
        description: "Please confirm the transaction in your wallet",
      });

      let certificateId: string;
      if (isNFT) {
        // Only instantiate IPFSService when needed for NFT
        const ipfsService = new IPFSService();
        const metadata = ipfsService.generateMetadata(
          certificateType,
          "Certificate issued by AvaCertify",
          uploadState.documentHash,
          formData.brandColor,
          institutionName
        );
        const metadataHash = await ipfsService.uploadJSON(metadata);
        certificateId = await certificateService.mintNFTCertificate(recipientAddress, ipfsService.getGatewayUrl(metadataHash));
      } else {
        certificateId = await certificateService.issueCertificate(recipientName, recipientAddress);
      }

      if (!certificateId) {
        throw new Error("Failed to retrieve certificate ID");
      }

      const newCertificate: Certificate = {
        id: certificateId,
        certificateId,
        recipientName,
        recipientAddress,
        certificateType,
        issueDate,
        expirationDate: expirationDate || undefined,
        institutionName,
        status: "active",
        additionalDetails,
        documentHash: uploadState.documentHash,
        documentUrl: uploadState.documentUrl,
        isNFT,
      };

      setCertificates((prev) => [...prev, newCertificate]);
      localStorage.setItem("certificates", JSON.stringify([...certificates, newCertificate]));

      toast({
        title: isNFT ? "NFT Certificate Issued" : "Certificate Issued",
        description: `Certificate ${certificateId} issued successfully to ${recipientName}`,
      });

      setFormData({
        recipientName: "",
        recipientAddress: "",
        certificateType: "",
        issueDate: "",
        expirationDate: "",
        additionalDetails: "",
        institutionName: "",
        logoUrl: "",
        brandColor: "#FFFFFF",
      });
      setUploadState({
        isUploading: false,
        documentHash: "",
        metadataHash: "",
        documentUrl: "",
      });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    } catch (error: unknown) {
      let message = isNFT ? "Failed to mint NFT certificate" : "Failed to issue certificate";
      if (error instanceof Error) {
        if (error.message.includes("4001") || error.message.includes("ACTION_REJECTED")) {
          message = "User rejected the transaction";
        } else if (error.message.includes("insufficient funds")) {
          message = "Insufficient AVAX for gas fees. Get test AVAX from faucet.";
        } else if (error.message.includes("network")) {
          message = "Please ensure you're connected to the Avalanche Fuji Testnet";
        } else if (error.message.includes("not authorized") || error.message.includes("ISSUER_ROLE")) {
          message = "Wallet not authorized to issue certificates. Contact admin.";
        } else if (error.message.includes("not registered")) {
          message = "Organization not registered. Please register first.";
        } else if (error.message.includes("CALL_EXCEPTION")) {
          message = "Transaction failed: Likely unauthorized issuer or invalid parameters.";
        } else {
          message = error.message;
        }
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsIssuing(false);
    }
  };

  function isFormValid(): boolean {
    const { recipientName, recipientAddress, certificateType, issueDate, institutionName, expirationDate } = formData;

    // Required fields
    if (!recipientName || !recipientAddress || !certificateType || !issueDate || !institutionName) {
      return false;
    }

    // Basic length constraint
    if (recipientName.length > 100) {
      return false;
    }

    // Validate Ethereum address format
    if (!ethers.isAddress(recipientAddress)) {
      return false;
    }

    // If a file is still uploading, form is not valid for submit
    if (uploadState.isUploading) {
      return false;
    }

    // If an expiration date is provided, it must be after the issue date
    if (expirationDate) {
      try {
        const issue = new Date(issueDate);
        const exp = new Date(expirationDate);
        if (isNaN(issue.getTime()) || isNaN(exp.getTime()) || exp <= issue) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // Additional checks for NFT issuance
    if (isNFT) {
      // Organization must be registered and branding provided to mint NFTs
      if (!isRegistered) return false;
      if (!formData.logoUrl || !formData.brandColor) return false;
    }

    return true;
  }
  return (
    <Layout>
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-6">Certificate Dashboard</h1>
        <Tabs defaultValue="issue" className="space-y-6">
          <TabsList>
            <TabsTrigger value="issue">Issue Certificate</TabsTrigger>
            <TabsTrigger value="view">View Certificates</TabsTrigger>
          </TabsList>
          <TabsContent value="issue">
            <Card>
              <CardHeader>
                <CardTitle>Issue New Certificate</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleIssueCertificate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Certificate Type</Label>
                    <div className="flex space-x-4">
                      <Button
                        type="button"
                        variant={isNFT ? "outline" : "default"}
                        onClick={() => setIsNFT(false)}
                      >
                        Standard Certificate
                      </Button>
                      <Button
                        type="button"
                        variant={isNFT ? "default" : "outline"}
                        onClick={() => setIsNFT(true)}
                      >
                        NFT Certificate
                      </Button>
                    </div>
                  </div>

                  {isNFT && !isRegistered && (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted">
                      <p className="text-sm font-medium">Register your organization first to issue NFT certificates</p>
                      <div className="space-y-2">
                        <Label htmlFor="logoUrl">Logo URL *</Label>
                        <Input
                          id="logoUrl"
                          value={formData.logoUrl}
                          onChange={(e) => handleInputChange("logoUrl", e.target.value)}
                          placeholder="https://example.com/logo.png"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="brandColor">Brand Color *</Label>
                        <Input
                          id="brandColor"
                          type="color"
                          value={formData.brandColor}
                          onChange={(e) => handleInputChange("brandColor", e.target.value)}
                        />
                      </div>
                      <Button type="button" onClick={handleRegisterOrganization} className="w-full">
                        Register Organization
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="document">Certificate Document (Optional - Requires IPFS Setup)</Label>
                    <Input
                      id="document"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleFileUpload}
                      disabled={uploadState.isUploading}
                    />
                    <p className="text-xs text-muted-foreground">
                      File upload requires Pinata IPFS credentials. You can issue certificates without uploading documents.
                    </p>
                    {uploadState.isUploading && (
                      <div className="flex items-center mt-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <p className="text-sm">Uploading to IPFS...</p>
                      </div>
                    )}
                    {uploadState.documentHash && (
                      <div className="mt-2 p-2 bg-green-50 rounded border flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="text-green-700">File uploaded successfully</p>
                          <p className="text-muted-foreground text-xs">IPFS Hash: {uploadState.documentHash}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recipientName">Recipient Name *</Label>
                    <Input
                      id="recipientName"
                      value={formData.recipientName}
                      onChange={(e) => handleInputChange("recipientName", e.target.value)}
                      placeholder="Full name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recipientAddress">Recipient Address *</Label>
                    <Input
                      id="recipientAddress"
                      value={formData.recipientAddress}
                      onChange={(e) => handleInputChange("recipientAddress", e.target.value)}
                      placeholder="0x..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certificateType">Certificate Type *</Label>
                    <Input
                      id="certificateType"
                      value={formData.certificateType}
                      onChange={(e) => handleInputChange("certificateType", e.target.value)}
                      placeholder="e.g., Bachelor of Science"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issueDate">Issue Date *</Label>
                    <Input
                      type="date"
                      id="issueDate"
                      value={formData.issueDate}
                      onChange={(e) => handleInputChange("issueDate", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">Expiration Date (Optional)</Label>
                    <Input
                      type="date"
                      id="expirationDate"
                      value={formData.expirationDate}
                      onChange={(e) => handleInputChange("expirationDate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="institutionName">Institution Name *</Label>
                    <Input
                      id="institutionName"
                      value={formData.institutionName}
                      onChange={(e) => handleInputChange("institutionName", e.target.value)}
                      placeholder="e.g., AvaCertify"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="additionalDetails">Additional Details (Optional)</Label>
                    <Textarea
                      id="additionalDetails"
                      value={formData.additionalDetails}
                      onChange={(e) => handleInputChange("additionalDetails", e.target.value)}
                      placeholder="Additional certificate information"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isIssuing || !isConnected || !isFormValid()}
                    className="w-full"
                  >
                    {isIssuing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Issuing Certificate...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Issue {isNFT ? "NFT" : ""} Certificate
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="view">
            <Card>
              <CardHeader>
                <CardTitle>Issued Certificates</CardTitle>
              </CardHeader>
              <CardContent>
                {certificates.length === 0 ? (
                  <p className="text-muted-foreground">No certificates issued yet.</p>
                ) : (
                  <div className="space-y-4">
                    {certificates.map((cert) => (
                      <motion.div
                        key={cert.id}
                      >
                        <Card
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => {
                            setSelectedCertificate(cert);
                            setIsDialogOpen(true);
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="font-semibold">{cert.certificateType}</h3>
                                <p className="text-sm text-muted-foreground">
                                  Issued to: {cert.recipientName}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Status: {cert.status} {cert.isNFT && "(NFT)"}
                                </p>
                              </div>
                              <FileText className="h-6 w-6 text-primary" />
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Certificate Details</DialogTitle>
              <DialogDescription>
                Detailed information about the selected certificate.
              </DialogDescription>
            </DialogHeader>
            {selectedCertificate && (
              <div className="space-y-4">
                <div>
                  <Label>Certificate ID {selectedCertificate.isNFT && "(Token ID)"}</Label>
                  <div className="flex items-center space-x-2">
                    <p className="truncate">{selectedCertificate.id}</p>
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
                  <Label>Recipient Name</Label>
                  <p>{selectedCertificate.recipientName}</p>
                </div>
                <div>
                  <Label>Recipient Address</Label>
                  <div className="flex items-center space-x-2">
                    <p className="truncate">{selectedCertificate.recipientAddress}</p>
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
                <div>
                  <Label>Certificate Type</Label>
                  <p>{selectedCertificate.certificateType}</p>
                </div>
                <div>
                  <Label>Issue Date</Label>
                  <p>{new Date(selectedCertificate.issueDate).toLocaleDateString()}</p>
                </div>
                {selectedCertificate.expirationDate && (
                  <div>
                    <Label>Expiration Date</Label>
                    <p>{new Date(selectedCertificate.expirationDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <Label>Institution Name</Label>
                  <p>{selectedCertificate.institutionName}</p>
                </div>
                {selectedCertificate.additionalDetails && (
                  <div>
                    <Label>Additional Details</Label>
                    <p>{selectedCertificate.additionalDetails}</p>
                  </div>
                )}
                {selectedCertificate.documentUrl && (
                  <div>
                    <Label>Document</Label>
                    <div className="flex items-center space-x-2">
                      <a
                        href={selectedCertificate.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View Document
                      </a>
                      <ExternalLink className="h-4 w-4" />
                    </div>
                  </div>
                )}
                {selectedCertificate.transactionHash && (
                  <div>
                    <Label>Transaction Hash</Label>
                    <div className="flex items-center space-x-2">
                      <p className="truncate">{selectedCertificate.transactionHash}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(selectedCertificate.transactionHash!, "Transaction Hash")
                        }
                      >
                        <Copy className="h-4 w-4" />
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