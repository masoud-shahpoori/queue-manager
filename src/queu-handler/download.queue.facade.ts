import {QueueProgress} from "./queue.progress";
import {QueuePending} from "./queue.pending";
import {QueueDownloaded} from "./queue.downloaded";
import {attachment, FileGet} from "../lib/fileHandler";
import {FileDownload} from "@web/ig-proto/proto/FileDownload_pb";
import {ProgressObserver} from "./observer/download/progress-observer";
import {PendingObserver} from "./observer/download/pending-observer";
import {DownloadObserver} from "./observer/download/download-observer";
import Selector = FileDownload.Selector;

export const MAX_LENGTH_PROGRESS_QUEUE = 10
export class DownloadQueueFacade {
    static instance : DownloadQueueFacade
    private static progressQueue = new QueueProgress<FileGet>()
    private static  pendingQueue = new QueuePending<FileGet>()
    private static  downloadedQueue = new QueueDownloaded<FileGet>()
    private constructor() {
    }

    public static getInstance(){
        if(!this.instance) {
            this.instance = new DownloadQueueFacade()
            this.progressQueue.addObserver(new ProgressObserver())
            this.pendingQueue.addObserver(new PendingObserver())
            this.downloadedQueue.addObserver(new DownloadObserver())
        }
        return this
    }


    public static sendToPending(token: string) {
        this.pendingQueue.enqueue(token, new FileGet(attachment, Selector.LARGE_THUMBNAIL));
        this.pendingQueue.notifyObservers();
    }

    public static sendToProgress() {
        const pendingRemoveItem = this.pendingQueue.dequeue();
        if (pendingRemoveItem) {
            this.progressQueue.enqueue(pendingRemoveItem.token, pendingRemoveItem.payload);
            this.progressQueue.notifyObservers();
        }
    }

    public static sendToDownload() {
        const progressRemoveItem = this.progressQueue.dequeue();
        if (progressRemoveItem) {
            this.downloadedQueue.enqueue(progressRemoveItem.token, progressRemoveItem.payload);
            this.downloadedQueue.notifyObservers();
        }
    }
    public static getProgress(){
        return this.progressQueue.getList()
    }
    public static getPending(){
        return this.pendingQueue.getList()
    }

    public static getDownloaded(){
        return this.downloadedQueue.getList()
    }



}