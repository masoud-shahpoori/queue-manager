import {QueueObserver} from "./observer/queue.observer";

export class QueueFactory<T> {

    public list:Array<{token:string,payload:T}>=[]
    protected addedList : Record<string, string>={}
    private observers: QueueObserver<T>[] = [];

    constructor() {
    }

    public enqueue(token:string,item:T){
        if(!this.isInList(token)){
        this.list.unshift({token,payload:item})
        this.addedList[token]=token
        }
    }

    public dequeue(){
        let item = this.list.pop()
        this.list =this.list
        return item

    }
    public isInList(token:string){
        return token in this.addedList
    }

   public addObserver(observer: QueueObserver<T>) {
        this.observers.push(observer);
    }

   // public notifyObservers(item: { token: string, payload: T }) {
   //      for (const observer of this.observers) {
   //          // observer.update(item);
   //      }}

   public notifyObservers() {
        for (const observer of this.observers) {
            observer.update(this);
        }
    }
public getList(){
        return this.list
}

}