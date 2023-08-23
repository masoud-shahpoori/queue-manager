import {QueueFactory} from "../queue.factory";

export abstract class QueueObserver<T>{
    abstract     update(queue: QueueFactory<T>): void;

}