import {QueueObserver} from "../queue.observer";
import {FileGet} from "../../../lib/fileHandler";

class PendingObserver implements QueueObserver<FileGet> {
    update(item: { token: string, payload: FileGet }) {
        // Handle updates based on the item being added or moved
        // For example, you can update UI components or trigger further actions\
        alert('pending'+item.token)
    }
}