export class QueuePendingSingleton {
    static instance : QueuePendingSingleton
private items =[]
    private constructor() {
    }

    public static getInstance(){
        if(!this.instance) this.instance = new QueuePendingSingleton()

        return this.instance
    }



}