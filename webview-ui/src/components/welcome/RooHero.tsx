const RooHero = () => {
	const w = window as any
	const imagesBaseUri = w.IMAGES_BASE_URI || ""

	return (
		<div className="mb-6 relative forced-color-adjust-none flex flex-col items-center justify-center w-full pt-6 pb-2">
			<div
				style={{
					backgroundColor: "var(--vscode-foreground)",
					WebkitMaskImage: `url('${imagesBaseUri}/rataz-badge.svg')`,
					WebkitMaskRepeat: "no-repeat",
					WebkitMaskSize: "contain",
					maskImage: `url('${imagesBaseUri}/rataz-badge.svg')`,
					maskRepeat: "no-repeat",
					maskSize: "contain",
				}}
				className="z-5 mx-auto">
				<img src={imagesBaseUri + "/rataz-badge.svg"} alt="Rataz AI logo" className="h-20 opacity-0" />
			</div>
		</div>
	)
}

export default RooHero
