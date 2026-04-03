import OBR from "https://owlbear.rodeo/sdk";
import { setupContextMenu } from "./contextMenu.js";
import { setupInitiativeList } from "./initiativeList.js";

OBR.onReady(() => {
    setupContextMenu();
    setupInitiativeList(document.querySelector("#initiative-list"));
});
