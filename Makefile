-include .env

deploy:
	@forge script script/DeployAll.s.sol:DeployAll --rpc-url $(SEPOLIA_RPC_URL) --account burner --sender 0xFB6a372F2F51a002b390D18693075157A459641F --verify --etherscan-api-key $(ETHERSCAN_API_KEY) --broadcast -vvvv