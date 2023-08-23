import {QueueObserver} from "../queue.observer";
import {FileGet} from "../../../lib/fileHandler";
import {QueueProgress} from "../../queue.progress";
import {DownloadQueueFacade, MAX_LENGTH_PROGRESS_QUEUE} from "../../download.queue.facade";

export class PendingObserver implements QueueObserver<FileGet> {
    update() {
        const progressQueue = DownloadQueueFacade.getProgress()
        if(progressQueue.length<MAX_LENGTH_PROGRESS_QUEUE){
            DownloadQueueFacade.sendToProgress()
        }
    }
}