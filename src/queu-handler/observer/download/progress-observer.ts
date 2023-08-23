import {QueueObserver} from "../queue.observer";
import {FileGet} from "../../../lib/fileHandler";
import {QueueFactory} from "../../queue.factory";
import {DownloadQueueFacade} from "../../download.queue.facade";

export class ProgressObserver implements QueueObserver<FileGet> {
    update(queue:QueueFactory<FileGet>) {
        for(const item of queue.getList().reverse()){
            console.log(item.payload)
            item.payload.start()
                item.payload.onFinish(()=>{
                    DownloadQueueFacade.sendToDownload()
                })
        }
    }
}