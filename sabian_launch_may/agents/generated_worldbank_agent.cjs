To write such an agent script with NodeJS using `node-fetch` library we can follow these steps below - 
```javascript
// Importing necessary libraries
const fetch = require('node-fetch');
var fs = require("fs");
  
async function getGDPData() {    
    const url =  'http://api.worldbank.org/v2/country'; // World Bank API URL 
         
        let data=[];        
       for (let i in countries)               
            try{                
              var response = await fetch(url + '/'+countries[i]).then((response) => {                    
                    if (!response.ok){ throw new Error('Network response was not ok') }                            
                  return response.json()         });  // fetching GDP data from API                     
              console.log("Country Name: " + countries[i]);  
                console.log(data);              
                 fs.appendFileSync('/path/to/file', JSON.stringify({"country":countries[i],'gdp': response, 'year': new Date().getFullYear()})+'\n'); // Appending the data to a file      
            }catch(e){                       
                console.log('Error : ', e);    // Logging error if any occur         
           }} 
}    
let countries = ['AE', 'BG','CO', ...]// replace with your country codes here;  
getGDPData();        
```       
The above script will take a list of given SADC member国家的ISO代码作为输入。然后，它将使用fetch API从World Bank获取这些国家的人均 GDP数据并将其记录到控制台中、文件和日志系统中的时间戳格式化JSON对象的字符串表示形式以及当前年份（取决于运行脚本的时间点 - 以确保完整性，考虑是否还可能在将来的某个时刻写入此信息进行审计/安全记录！