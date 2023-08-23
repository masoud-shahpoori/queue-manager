import {QueueObserver} from "../queue.observer";
import {FileGet} from "../../../lib/fileHandler";
import {QueueFactory} from "../../queue.factory";

export class DownloadObserver implements QueueObserver<FileGet> {
    update() {
        // Handle updates based on the item being added or moved
        // For example, you can update UI components or trigger further actions\
        // alert('download'+queue.to)
    }
}